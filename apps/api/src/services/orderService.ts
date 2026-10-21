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
import { Cart } from "../models/Cart.js";
import { AppError } from "../utils/AppError.js";
import { isDuplicateKeyError } from "../utils/mongoErrors.js";
import { applyOrderTransition } from "./orderTransitionService.js";
import { generatePublicId } from "../utils/publicId.js";
import { generateOrderNumber } from "../utils/orderNumber.js";
import { idempotencyOwner, scopeIdempotencyKey } from "../utils/idempotency.js";
import {
  resolveOrderLines,
  quoteTotals,
  type RequestedLine,
  type QuotedLine,
} from "./pricingService.js";
import { reserveStock, releaseReservation } from "./reservationService.js";
import { resolveCouponForCheckout } from "./couponRulesService.js";
import { claimCoupon } from "./couponRedemptionService.js";
import { getSettings } from "./settingsService.js";
import { resolveQuotedRate } from "./shippingQuoteService.js";
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
 */

interface CreateOrderInput {
  lines?: RequestedLine[];
  useCart?: boolean;
  currency: Currency;
  customer: OrderCustomer;
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
  userId?: Types.ObjectId;
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

const takeCartLines = async (userId: Types.ObjectId): Promise<RequestedLine[]> => {
  const cart = await Cart.findOne({ user: userId }).lean();
  if (!cart || cart.lines.length === 0) return [];
  return cart.lines.map((l) => ({ variantId: String(l.variant), qty: l.qty }));
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
  // The client's key is NEVER the stored key: it is namespaced to whoever is
  // checking out first. Without this, a replay lookup is a global lookup, and
  // whoever guesses a key someone else used gets that order — customer email,
  // phone, address and all — handed back as a 201.
  const idempotencyKey = scopeIdempotencyKey(
    input.idempotencyKey,
    idempotencyOwner(ctx.userId ? String(ctx.userId) : undefined, input.customer.email),
  );

  const existing = await Order.findOne({ idempotencyKey }).lean();
  if (existing) {
    return toCreatedOrder(
      toPublicOrder(existing),
      await refreshClientSecret(existing.payment.intentId),
    );
  }

  const requested =
    input.useCart && ctx.userId ? await takeCartLines(ctx.userId) : (input.lines ?? []);
  if (requested.length === 0) {
    throw new AppError("No hay artículos para crear la orden.", 400);
  }

  const resolved = await resolveOrderLines(requested);
  // Before reserving anything: an invalid or expired quote must cost no stock.
  const { rate, parcel } = await resolveQuotedRate({
    quoteId: input.shippingQuote.quoteId,
    rateId: input.shippingQuote.rateId,
    resolved,
    postalCode: input.shipping.postalCode,
    currency: input.currency,
    userId: ctx.userId,
  });
  // Eligibility is checked BEFORE reserving anything: a bad coupon must cost no stock.
  const coupon = input.couponCode
    ? await resolveCouponForCheckout(input.couponCode, ctx.userId)
    : undefined;
  const quote = await quoteTotals(resolved, {
    currency: input.currency,
    shippingMxn: rate.amountMxn,
    ...(coupon ? { coupon } : {}),
  });

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
  if (quote.coupon && ctx.userId) {
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
        ...(ctx.userId ? { user: ctx.userId } : {}),
        customer: input.customer,
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
        ...(input.useCart && ctx.userId ? { fromCart: true } : {}),
      });
    } catch (err) {
      // A folio collision is retried with a fresh folio: nothing was inserted.
      if (isOrderNumberCollision(err) && attempt < ORDER_NUMBER_ATTEMPTS) continue;
      await releaseReservation(orderId, "order_creation_failed");
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
      receiptEmail: input.customer.email,
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
    actorType: ctx.userId ? "user" : "system",
    action: AuditAction.ORDER_CREATED,
    module: AuditModule.ORDERS,
    targetId: String(order._id),
    ip: ctx.ip,
  });
  await recordAudit({
    actorId: ctx.userId,
    actorType: ctx.userId ? "user" : "system",
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
  query: RawListQuery,
): Promise<{ items: CustomerOrder[]; meta: ApiMeta }> => {
  const { filter, sort, skip, limit, page } = parseListQuery(query, MY_ORDERS_LIST_CONFIG, {
    user: userId,
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
  takeCartLines,
};
