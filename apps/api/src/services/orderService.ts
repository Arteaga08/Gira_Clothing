import mongoose, { Types } from "mongoose";
import { AuditAction, AuditModule, OrderStatus, PaymentStatus } from "@gira/shared";
import type { ApiMeta, Currency } from "@gira/shared";
import {
  Order,
  type OrderDocument,
  type OrderCustomer,
  type ShippingAddress,
  type OrderLineSnapshot,
} from "../models/Order.js";
import { Cart } from "../models/Cart.js";
import { AppError } from "../utils/AppError.js";
import { generatePublicId } from "../utils/publicId.js";
import { resolveOrderLines, quoteTotals, type RequestedLine, type QuotedLine } from "./pricingService.js";
import { reserveStock, releaseReservation } from "./reservationService.js";
import { getSettings } from "./settingsService.js";
import { getPaymentProvider, type PaymentView } from "../adapters/payment/index.js";
import { recordAudit } from "./auditService.js";
import { clearCart } from "./cartService.js";
import { parseListQuery, buildMeta, type ListQueryConfig, type RawListQuery } from "../utils/parseListQuery.js";
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
  idempotencyKey: string;
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
  status: OrderStatus;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: PublicOrderLine[];
  currency: Currency;
  subtotal: number;
  shippingCost: number;
  total: number;
  createdAt: Date;
  paidAt?: Date;
}

interface CreatedOrder {
  order: PublicOrder;
  clientSecret?: string;
}

interface OrderLean {
  publicId: string;
  status: OrderStatus;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: OrderLineSnapshot[];
  currency: Currency;
  subtotal: number;
  shippingCost: number;
  total: number;
  createdAt: Date;
  paidAt?: Date;
  payment: { intentId?: string };
}

/**
 * DTO for anything sent OUTSIDE the admin panel (public order lookup, "my
 * orders"). Deliberately excludes idempotencyKey, payment.intentId, user, and
 * the Mongo _id — none of that is this endpoint's business to reveal.
 */
const toPublicOrder = (doc: OrderLean): PublicOrder => ({
  publicId: doc.publicId,
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
  shippingCost: doc.shippingCost,
  total: doc.total,
  createdAt: doc.createdAt,
  ...(doc.paidAt ? { paidAt: doc.paidAt } : {}),
});

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: number }).code === 11000;

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
  const existing = await Order.findOne({ idempotencyKey: input.idempotencyKey }).lean();
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
  const quote = await quoteTotals(resolved, {
    currency: input.currency,
    destinationCountry: input.shipping.country,
  });

  const settings = await getSettings();
  const orderId = new mongoose.Types.ObjectId();

  await reserveStock(
    orderId,
    resolved.map((l) => ({ variant: l.variant, qty: l.qty })),
    settings.reservation.ttlMinutes,
    { actorId: ctx.userId, ip: ctx.ip },
  );

  let order: OrderDocument;
  try {
    order = await Order.create({
      _id: orderId,
      publicId: generatePublicId(),
      ...(ctx.userId ? { user: ctx.userId } : {}),
      customer: input.customer,
      shipping: input.shipping,
      lines: quote.lines.map(toLineSnapshot),
      currency: quote.currency,
      exchangeRate: quote.exchangeRate,
      rounding: quote.rounding,
      subtotal: quote.subtotal,
      shippingCost: quote.shippingCost,
      total: quote.total,
      status: OrderStatus.PENDING_PAYMENT,
      statusHistory: [{ status: OrderStatus.PENDING_PAYMENT, at: new Date() }],
      payment: { provider: "stripe", status: PaymentStatus.REQUIRES_PAYMENT },
      idempotencyKey: input.idempotencyKey,
    });
  } catch (err) {
    await releaseReservation(orderId, "order_creation_failed");
    // A racing request with the same key won: return ITS order, not an error.
    if (isDuplicateKeyError(err)) {
      const winner = await Order.findOne({ idempotencyKey: input.idempotencyKey }).lean();
      if (winner) {
        return toCreatedOrder(
          toPublicOrder(winner),
          await refreshClientSecret(winner.payment.intentId),
        );
      }
    }
    throw err;
  }

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
    order.status = OrderStatus.CANCELLED;
    order.statusHistory.push({
      status: OrderStatus.CANCELLED,
      at: new Date(),
      reason: "payment_setup_failed",
    });
    await order.save();
    throw err;
  }

  order.payment.intentId = payment.providerId;
  order.payment.status = payment.status;
  await order.save();

  if (input.useCart && ctx.userId) await clearCart(ctx.userId);

  await recordAudit({
    actorId: ctx.userId,
    actorType: ctx.userId ? "user" : "system",
    action: AuditAction.ORDER_CREATED,
    module: AuditModule.ORDERS,
    targetId: order.publicId,
    ip: ctx.ip,
  });
  await recordAudit({
    actorId: ctx.userId,
    actorType: ctx.userId ? "user" : "system",
    action: AuditAction.PAYMENT_INTENT_CREATED,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
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
): Promise<{ items: PublicOrder[]; meta: ApiMeta }> => {
  const { filter, sort, skip, limit, page } = parseListQuery(query, MY_ORDERS_LIST_CONFIG, {
    user: userId,
  });
  const [docs, total] = await Promise.all([
    Order.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { items: docs.map(toPublicOrder), meta: buildMeta(total, { page, limit }) };
};

/**
 * Ownership check via the filter itself — ownerId is baked into the query, not
 * checked after the fact. An order that exists but belongs to someone else
 * returns 404, never 403: confirming existence would leak information.
 */
const getMyOrder = async (userId: Types.ObjectId, id: string): Promise<PublicOrder> => {
  const doc = await Order.findOne({ _id: id, user: userId }).lean();
  if (!doc) throw new AppError("La orden no existe.", 404);
  return toPublicOrder(doc);
};

export type { CreateOrderInput, OrderContext, CreatedOrder, PublicOrder, PublicOrderLine, OrderLean };
export { createOrder, toPublicOrder, getOrderByPublicId, listMyOrders, getMyOrder };
