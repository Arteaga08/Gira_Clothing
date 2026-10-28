import mongoose, { Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  OrderStatus,
  PaymentStatus,
  SHIPPING_CARRIER_LABELS,
} from "@gira/shared";
import type {
  ApiMeta,
  Currency,
  CustomerOrder,
  OrderCoupon,
  CustomerShipment,
  ShipmentTrackingStatus,
  ShippingCarrier,
} from "@gira/shared";
import {
  Order,
  type OrderDocument,
  type OrderLabel,
  type OrderCustomer,
  type ShippingAddress,
  type OrderLineSnapshot,
  type ShippingSelectionAttrs,
} from "../models/Order.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { isDuplicateKeyError } from "../utils/mongoErrors.js";
import { applyOrderTransition } from "./orderTransitionService.js";
import { generatePublicId } from "../utils/publicId.js";
import { generateOrderNumber } from "../utils/orderNumber.js";
import { idempotencyOwner, scopeIdempotencyKey } from "../utils/idempotency.js";
import type { RequestedLine, QuotedLine } from "./pricingService.js";
import { priceCheckout, takeCartLines } from "./checkoutPricingService.js";
import { cancelPendingOrder } from "./pendingOrderService.js";
import { reserveStock, releaseReservation } from "./reservationService.js";
import { claimCoupon } from "./couponRedemptionService.js";
import { getSettings } from "./settingsService.js";
import { getPaymentProvider, type PaymentView } from "../adapters/payment/index.js";
import { recordAudit } from "./auditService.js";
import {
  parseListQuery,
  buildMeta,
  type ListQueryConfig,
  type RawListQuery,
} from "../utils/parseListQuery.js";
import type { ImageAttrs } from "../models/schemas/image.js";

/**
 * Checkout. The order of operations is load-bearing; do not reshuffle it.
 *
 *  1. Idempotency check FIRST. A retry must short-circuit before it can reserve
 *     stock or create a second charge.
 *  2. Resolve + price the lines from the DB. The client's payload contributes
 *     variant ids, quantities, address and currency — never a single amount.
 *  3. Reserve stock BEFORE persisting the order, using a pre-generated order id.
 *     If the process dies between the two, an active reservation points at an
 *     order that does not exist, and the expiry sweep releases it at TTL —
 *     stock recovers by itself. The reverse order would leave a pending order
 *     holding nothing, which the customer could pay for.
 *  4. Persist the order.
 *  5. Ask the provider for a payment intent, keyed by publicId so a network
 *     retry reuses the same charge.
 *
 * Steps 4 and 5 roll back explicitly on failure: release the hold, mark the
 * order cancelled. Nothing is left holding units it will never sell.
 *
 * Accounts only (M16): the buyer's email and name come from the account, and an
 * unverified email cannot pay (order and tracking emails travel there). One
 * pending order per customer, enforced by a partial unique index.
 */

interface CreateOrderInput {
  lines?: RequestedLine[];
  useCart?: boolean;
  currency: Currency;
  /** Contact phone for the carrier; email and name are the account's. */
  customer: { phone: string };
  shipping: ShippingAddress;
  /** The stored quote + rate the customer picked; the amount is never taken from the client. */
  shippingQuote: { quoteId: string; rateId: string };
  idempotencyKey: string;
  /** Optional campaign coupon code; accounts only. The discount is computed server-side. */
  couponCode?: string;
  /** Checkout consent. Validated by Joi; the service only stamps `termsAcceptedAt`. */
  termsAccepted: true;
}

interface OrderContext {
  userId: Types.ObjectId;
  ip?: string;
}

interface PublicOrderLine {
  sku: string;
  productName: string;
  printName: string;
  image?: ImageAttrs;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface PublicOrder {
  publicId: string;
  orderNumber: string;
  status: OrderStatus;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: PublicOrderLine[];
  currency: Currency;
  subtotal: number;
  discount: number;
  shippingCost: number;
  shippingSelection: { carrier: ShippingCarrier; serviceName: string; estimatedDays: number };
  coupon: OrderCoupon | null;
  tax: number;
  taxRateBps: number;
  total: number;
  createdAt: Date;
  paidAt?: Date;
}

interface CreatedOrder {
  order: PublicOrder;
  clientSecret?: string;
}

interface OrderLean {
  _id: Types.ObjectId;
  publicId: string;
  orderNumber: string;
  status: OrderStatus;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: OrderLineSnapshot[];
  currency: Currency;
  subtotal: number;
  discount: number;
  shippingCost: number;
  shippingSelection: ShippingSelectionAttrs;
  coupon?: OrderCoupon;
  tax: number;
  taxRateBps: number;
  total: number;
  createdAt: Date;
  paidAt?: Date;
  payment: { intentId?: string };
  label?: OrderLabel;
  tracking?: { status: ShipmentTrackingStatus };
  shippedAt?: Date;
  deliveredAt?: Date;
}

/**
 * DTO for the public lookup by `publicId` (a capability URL) and the checkout
 * response. Deliberately excludes idempotencyKey, payment.intentId, user, and
 * the Mongo _id — whoever holds the publicId must not learn anything else.
 */
const toPublicOrder = (doc: OrderLean): PublicOrder => ({
  publicId: doc.publicId,
  orderNumber: doc.orderNumber,
  status: doc.status,
  customer: doc.customer,
  shipping: doc.shipping,
  lines: doc.lines.map((l) => ({
    sku: l.sku,
    productName: l.productName,
    printName: l.printName,
    ...(l.image ? { image: l.image } : {}),
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
  })),
  currency: doc.currency,
  subtotal: doc.subtotal,
  discount: doc.discount,
  shippingCost: doc.shippingCost,
  shippingSelection: {
    carrier: doc.shippingSelection.carrier,
    serviceName: doc.shippingSelection.serviceName,
    estimatedDays: doc.shippingSelection.estimatedDays,
  },
  coupon: doc.coupon
    ? { code: doc.coupon.code, discountType: doc.coupon.discountType, value: doc.coupon.value }
    : null,
  tax: doc.tax,
  taxRateBps: doc.taxRateBps,
  total: doc.total,
  createdAt: doc.createdAt,
  ...(doc.paidAt ? { paidAt: doc.paidAt } : {}),
});

/**
 * DTO for the OWNING customer ("my orders"): the public view plus the internal
 * id, which the account screens need to open an order. Ownership is enforced in
 * the query filter, so handing the id back to its owner reveals nothing.
 */
/**
 * The carrier data the owning customer may see, only once the order is shipped.
 * The label itself (cost, credential, PDF) never leaves through here.
 */
const toCustomerShipment = (doc: OrderLean): CustomerShipment | undefined => {
  const shipped = doc.status === OrderStatus.SHIPPED || doc.status === OrderStatus.DELIVERED;
  if (!shipped || !doc.label?.trackingNumber || !doc.label.carrier) return undefined;
  return {
    carrier: doc.label.carrier,
    carrierName: SHIPPING_CARRIER_LABELS[doc.label.carrier],
    trackingNumber: doc.label.trackingNumber,
    ...(doc.label.trackUrl ? { trackUrl: doc.label.trackUrl } : {}),
    ...(doc.tracking ? { status: doc.tracking.status } : {}),
    ...(doc.shippedAt ? { shippedAt: doc.shippedAt } : {}),
    ...(doc.deliveredAt ? { deliveredAt: doc.deliveredAt } : {}),
  };
};

const toCustomerOrder = (doc: OrderLean): CustomerOrder => {
  const shipment = toCustomerShipment(doc);
  return { id: String(doc._id), ...toPublicOrder(doc), ...(shipment ? { shipment } : {}) };
};

const ORDER_NUMBER_ATTEMPTS = 3;

const isOrderNumberCollision = (err: unknown): boolean => {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e.code === 11000 && e.keyPattern !== undefined && "orderNumber" in e.keyPattern;
};

/** Best-effort refresh: a stale or unreachable intent must never break the idempotent replay. */
const refreshClientSecret = async (intentId?: string): Promise<string | undefined> => {
  if (!intentId) return undefined;
  try {
    const payment = await getPaymentProvider().getPayment(intentId);
    return payment.clientSecret;
  } catch {
    return undefined;
  }
};

const toCreatedOrder = (order: PublicOrder, clientSecret: string | undefined): CreatedOrder => ({
  order,
  ...(clientSecret !== undefined ? { clientSecret } : {}),
});

const PENDING_EXISTS = "Ya tienes un pedido por pagar. Págalo o cancélalo para hacer otro.";

const isPendingCollision = (err: unknown): boolean => {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e.code === 11000 && e.keyPattern !== undefined && Object.keys(e.keyPattern).join() === "user";
};

/** The account behind the checkout. Email and name are frozen from here, never from the body. */
const loadBuyer = async (userId: Types.ObjectId) => {
  const user = await User.findById(userId).select("email firstName lastName emailVerified").lean();
  if (!user) throw new AppError("No has iniciado sesión.", 401);
  if (!user.emailVerified) throw new AppError("Verifica tu correo antes de pagar.", 403);
  return user;
};

const toLineSnapshot = (l: QuotedLine): OrderLineSnapshot => ({
  variant: l.variant,
  product: l.product,
  sku: l.sku,
  productName: l.productName,
  printName: l.printName,
  ...(l.image ? { image: l.image } : {}),
  qty: l.qty,
  unitPriceMxn: l.unitPriceMxn,
  unitPrice: l.unitPrice,
  lineTotal: l.lineTotal,
});

const createOrder = async (input: CreateOrderInput, ctx: OrderContext): Promise<CreatedOrder> => {
  // The client's key is NEVER the stored key: it is namespaced to the account.
  // Without this, a replay lookup is a global lookup, and whoever guesses a key
  // someone else used gets that order — email, phone and address — back as a 201.
  const idempotencyKey = scopeIdempotencyKey(
    input.idempotencyKey,
    idempotencyOwner(String(ctx.userId)),
  );

  const existing = await Order.findOne({ idempotencyKey }).lean();
  if (existing) {
    return toCreatedOrder(
      toPublicOrder(existing),
      await refreshClientSecret(existing.payment.intentId),
    );
  }

  const buyer = await loadBuyer(ctx.userId);
  const customer: OrderCustomer = {
    email: buyer.email,
    name: `${buyer.firstName} ${buyer.lastName}`.trim(),
    phone: input.customer.phone,
  };

  // Cheap early answer; the partial unique index is what really holds under a race.
  if (await Order.exists({ user: ctx.userId, status: OrderStatus.PENDING_PAYMENT })) {
    throw new AppError(PENDING_EXISTS, 409);
  }

  // Lines, quote, coupon and the $10 floor are all checked BEFORE anything is held.
  const { resolved, shipping, quote } = await priceCheckout({
    requested: input.useCart ? await takeCartLines(ctx.userId) : (input.lines ?? []),
    currency: input.currency,
    userId: ctx.userId,
    couponCode: input.couponCode,
    shippingQuote: { ...input.shippingQuote, postalCode: input.shipping.postalCode },
  });
  if (!shipping) throw new AppError("Elige una opción de envío.", 400);
  const { rate, parcel } = shipping;

  const settings = await getSettings();
  const orderId = new mongoose.Types.ObjectId();

  await reserveStock(
    orderId,
    resolved.map((l) => ({ variant: l.variant, qty: l.qty })),
    settings.reservation.ttlMinutes,
    { actorId: ctx.userId, ip: ctx.ip },
  );

  // Atomic seat + one-per-customer, AFTER stock is held so a lost race hands the stock back.
  // From here on every failure path calls releaseReservation, which also frees the coupon.
  if (quote.coupon) {
    try {
      await claimCoupon({
        couponId: quote.coupon.couponId,
        userId: ctx.userId,
        orderId,
        discount: quote.discount,
      });
    } catch (err) {
      await releaseReservation(orderId, "coupon_unavailable");
      throw err;
    }
  }

  let order: OrderDocument | undefined;
  for (let attempt = 1; attempt <= ORDER_NUMBER_ATTEMPTS && !order; attempt += 1) {
    try {
      order = await Order.create({
        _id: orderId,
        publicId: generatePublicId(),
        orderNumber: generateOrderNumber(),
        user: ctx.userId,
        customer,
        shipping: input.shipping,
        lines: quote.lines.map(toLineSnapshot),
        currency: quote.currency,
        exchangeRate: quote.exchangeRate,
        rounding: quote.rounding,
        subtotal: quote.subtotal,
        discount: quote.discount,
        ...(quote.coupon ? { couponId: quote.coupon.couponId, coupon: quote.coupon.snapshot } : {}),
        shippingCost: quote.shippingCost,
        shippingSelection: {
          provider: rate.provider,
          carrier: rate.carrier,
          service: rate.service,
          serviceName: rate.serviceName,
          estimatedDays: rate.estimatedDays,
          amountMxn: rate.amountMxn,
          costMxn: rate.costMxn,
        },
        parcel,
        tax: quote.tax,
        taxRateBps: quote.taxRateBps,
        total: quote.total,
        termsAcceptedAt: new Date(),
        status: OrderStatus.PENDING_PAYMENT,
        statusHistory: [{ status: OrderStatus.PENDING_PAYMENT, at: new Date() }],
        payment: { provider: "stripe", status: PaymentStatus.REQUIRES_PAYMENT },
        idempotencyKey,
        ...(input.useCart ? { fromCart: true } : {}),
      });
    } catch (err) {
      // A folio collision is retried with a fresh folio: nothing was inserted.
      if (isOrderNumberCollision(err) && attempt < ORDER_NUMBER_ATTEMPTS) continue;
      await releaseReservation(orderId, "order_creation_failed");
      if (isPendingCollision(err)) throw new AppError(PENDING_EXISTS, 409);
      if (isOrderNumberCollision(err)) {
        throw new AppError("No se pudo generar el folio de la orden. Intenta de nuevo.", 503);
      }
      // A racing request with the same key won: return ITS order, not an error.
      if (isDuplicateKeyError(err)) {
        const winner = await Order.findOne({ idempotencyKey }).lean();
        if (winner) {
          return toCreatedOrder(
            toPublicOrder(winner),
            await refreshClientSecret(winner.payment.intentId),
          );
        }
      }
      throw err;
    }
  }
  if (!order) throw new AppError("No se pudo generar el folio de la orden.", 500);

  let payment: PaymentView;
  try {
    payment = await getPaymentProvider().createPayment({
      amount: quote.total,
      currency: quote.currency,
      idempotencyKey: order.publicId,
      metadata: { orderId: String(order._id), publicId: order.publicId },
      receiptEmail: customer.email,
    });
  } catch (err) {
    await releaseReservation(orderId, "payment_setup_failed");
    await applyOrderTransition({
      orderId: order._id,
      from: OrderStatus.PENDING_PAYMENT,
      to: OrderStatus.CANCELLED,
      actor: { type: "system" },
      reason: "payment_setup_failed",
      set: { cancelReason: "payment_setup_failed" },
    });
    throw err;
  }

  // Targeted writes, not order.save(): the webhook can already be paying this
  // order (it finds it through metadata.orderId), and a whole-document save would
  // overwrite the `payment.status = succeeded` it just wrote.
  const attached = await Order.findOneAndUpdate(
    { _id: order._id },
    { $set: { "payment.intentId": payment.providerId } },
    { new: true },
  );
  if (attached) order = attached;
  if (payment.status !== PaymentStatus.REQUIRES_PAYMENT) {
    const synced = await Order.findOneAndUpdate(
      { _id: order._id, "payment.status": PaymentStatus.REQUIRES_PAYMENT },
      { $set: { "payment.status": payment.status } },
      { new: true },
    );
    if (synced) order = synced;
  }

  await recordAudit({
    actorId: ctx.userId,
    actorType: "user",
    action: AuditAction.ORDER_CREATED,
    module: AuditModule.ORDERS,
    targetId: String(order._id),
    ip: ctx.ip,
  });
  await recordAudit({
    actorId: ctx.userId,
    actorType: "user",
    action: AuditAction.PAYMENT_INTENT_CREATED,
    module: AuditModule.PAYMENTS,
    targetId: String(order._id),
    ip: ctx.ip,
  });

  return toCreatedOrder(toPublicOrder(order.toObject()), payment.clientSecret);
};

// --- Read paths: public capability lookup + the authenticated "my orders" panel ---

const MY_ORDERS_LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "total", "status"],
  searchable: [],
  defaultSort: "-createdAt",
};

/** GET /orders/:publicId — the id itself is the access credential (anti-IDOR). */
const getOrderByPublicId = async (publicId: string): Promise<PublicOrder> => {
  const doc = await Order.findOne({ publicId }).lean();
  if (!doc) throw new AppError("La orden no existe.", 404);
  return toPublicOrder(doc);
};

const listMyOrders = async (
  userId: Types.ObjectId,
  query: RawListQuery & { status?: OrderStatus },
): Promise<{ items: CustomerOrder[]; meta: ApiMeta }> => {
  const { filter, sort, skip, limit, page } = parseListQuery(query, MY_ORDERS_LIST_CONFIG, {
    user: userId,
    ...(query.status ? { status: query.status } : {}),
  });
  const [docs, total] = await Promise.all([
    Order.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { items: docs.map(toCustomerOrder), meta: buildMeta(total, { page, limit }) };
};

/**
 * Ownership check via the filter itself — ownerId is baked into the query, not
 * checked after the fact. An order that exists but belongs to someone else
 * returns 404, never 403: confirming existence would leak information.
 */
const getMyOrder = async (userId: Types.ObjectId, id: string): Promise<CustomerOrder> => {
  const doc = await Order.findOne({ _id: id, user: userId }).lean();
  if (!doc) throw new AppError("La orden no existe.", 404);
  return toCustomerOrder(doc);
};

const NOT_PENDING = "Este pedido ya no está por pagar.";

const findMyPendingOrder = async (userId: Types.ObjectId, id: string): Promise<OrderDocument> => {
  const order = await Order.findOne({ _id: id, user: userId });
  if (!order) throw new AppError("La orden no existe.", 404);
  if (order.status !== OrderStatus.PENDING_PAYMENT) throw new AppError(NOT_PENDING, 409);
  return order;
};

/**
 * Resume paying a pending order: the SAME intent's client secret, read back from
 * the provider (it is never stored). A card declined earlier leaves the order
 * pending and the intent retryable until the reservation expires.
 */
const payMyOrder = async (
  userId: Types.ObjectId,
  id: string,
): Promise<{ order: CustomerOrder; clientSecret: string }> => {
  const order = await findMyPendingOrder(userId, id);
  const intentId = order.payment.intentId;
  if (!intentId) throw new AppError(NOT_PENDING, 409);

  const payment = await getPaymentProvider().getPayment(intentId);
  if (payment.status === PaymentStatus.SUCCEEDED || payment.status === PaymentStatus.PROCESSING) {
    throw new AppError("Tu pago ya se está procesando.", 409);
  }
  // The expiry sweep or a cancel closed the window; the order follows shortly.
  if (payment.status === PaymentStatus.CANCELLED) throw new AppError(NOT_PENDING, 409);
  if (!payment.clientSecret) {
    throw new AppError("No se pudo reanudar el pago. Intenta de nuevo.", 502);
  }
  return { order: toCustomerOrder(order.toObject()), clientSecret: payment.clientSecret };
};

/** The customer's own cancel: same path as the panel's (intent first, then order, then stock). */
const cancelMyOrder = async (
  userId: Types.ObjectId,
  id: string,
  ip?: string,
): Promise<CustomerOrder> => {
  const order = await findMyPendingOrder(userId, id);
  const cancelled = await cancelPendingOrder(order, {
    actorId: userId,
    reason: "customer_cancelled",
    cancelReason: "customer_cancelled",
    paidMessage: "Tu pago ya se procesó; este pedido ya no se puede cancelar.",
  });
  if (!cancelled) throw new AppError(NOT_PENDING, 409);

  await recordAudit({
    actorId: userId,
    actorType: "user",
    action: AuditAction.ORDER_STATUS_CHANGED,
    module: AuditModule.ORDERS,
    targetId: String(order._id),
    before: { status: OrderStatus.PENDING_PAYMENT },
    after: { status: OrderStatus.CANCELLED },
    ip,
  });
  return toCustomerOrder(cancelled.toObject());
};

export type {
  CreateOrderInput,
  OrderContext,
  CreatedOrder,
  PublicOrder,
  PublicOrderLine,
  OrderLean,
};
export {
  createOrder,
  toPublicOrder,
  toCustomerOrder,
  getOrderByPublicId,
  listMyOrders,
  getMyOrder,
  payMyOrder,
  cancelMyOrder,
  takeCartLines,
};
