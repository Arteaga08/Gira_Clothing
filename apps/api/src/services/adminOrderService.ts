import type { Types } from "mongoose";
import type { ApiMeta } from "@gira/shared";
import {
  AuditAction,
  AuditModule,
  NotificationChannelKind,
  NotificationType,
  DisputeStatus,
  MAX_ORDER_ACTIVITY,
  REFUND_REQUEST_STALE_MS,
  ORDER_STATUS_GROUPS,
  ORDER_STATUS_TO_GROUP,
  OrderPriority,
  OrderStatus,
  PaymentStatus,
  ShippingLabelStatus,
  type AdminOrder,
  type BulkStatusResult,
  type CustomerOrder,
  type OrderActivityEntry,
  type OrderStatusGroup,
  type ShipmentTrackingStatus,
  type OrderSummary,
} from "@gira/shared";
import {
  Order,
  type OrderDocument,
  type OrderLabel,
  type OrderPayment,
  type ParcelAttrs,
  type ShippingAddress,
} from "../models/Order.js";
import { AuditLog } from "../models/AuditLog.js";
import { AppError } from "../utils/AppError.js";
import { toOrderEmailSnapshot } from "../utils/orderEmailSnapshot.js";
import { assertAdminTransition } from "../utils/orderTransitions.js";
import { applyOrderTransition } from "./orderTransitionService.js";
import { getPaymentProvider } from "../adapters/payment/index.js";
import { recordAudit } from "./auditService.js";
import { enqueueNotification } from "./notificationService.js";
import { releaseReservation } from "./reservationService.js";
import { logger } from "../config/logger.js";
import {
  parseListQuery,
  buildMeta,
  escapeRegex,
  type ListQueryConfig,
  type RawListQuery,
} from "../utils/parseListQuery.js";
import { toCustomerOrder, type OrderLean } from "./orderService.js";
import { requestLabelCancellation } from "./shippingLabelService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * Admin view of an order: everything the public/customer DTO withholds
 * (payment.intentId, statusHistory with actors, the owning user, consent and
 * cancel reason) is legitimate here: this is the operational panel. The wire
 * shape is the shared `AdminOrder`, so the panel and the API cannot drift.
 */
interface AdminOrderLean extends OrderLean {
  user?: Types.ObjectId;
  priority?: OrderPriority;
  termsAcceptedAt: Date;
  cancelReason?: string;
  parcel: ParcelAttrs;
  label?: OrderLabel;
  tracking?: { status: ShipmentTrackingStatus; lastEventAt?: Date; lastSyncedAt?: Date };
  shippedAt?: Date;
  deliveredAt?: Date;
  statusHistory: {
    status: OrderStatus;
    at: Date;
    actorType: "user" | "system";
    actorId?: Types.ObjectId;
    reason?: string;
  }[];
  payment: OrderPayment;
  disputeStatus?: DisputeStatus;
  disputedAt?: Date;
  updatedAt: Date;
}

/** The customer view minus `publicId`: a credential staff never need (they use `id` and `orderNumber`). */
const withoutPublicId = (order: CustomerOrder): Omit<CustomerOrder, "publicId"> => {
  const { publicId, ...rest } = order;
  void publicId;
  return rest;
};

const toAdminOrder = (doc: AdminOrderLean): AdminOrder => ({
  ...withoutPublicId(toCustomerOrder(doc)),
  ...(doc.user ? { user: String(doc.user) } : {}),
  priority: doc.priority ?? OrderPriority.NORMAL,
  termsAcceptedAt: doc.termsAcceptedAt,
  ...(doc.cancelReason ? { cancelReason: doc.cancelReason } : {}),
  statusHistory: doc.statusHistory.map((entry) => ({
    status: entry.status,
    at: entry.at,
    actorType: entry.actorType,
    ...(entry.actorId ? { actorId: String(entry.actorId) } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
  })),
  payment: {
    provider: doc.payment.provider,
    ...(doc.payment.intentId ? { intentId: doc.payment.intentId } : {}),
    status: doc.payment.status,
    ...(doc.payment.lastError ? { lastError: doc.payment.lastError } : {}),
    ...(doc.payment.capturedAt ? { capturedAt: doc.payment.capturedAt } : {}),
    ...(doc.payment.card
      ? { card: { brand: doc.payment.card.brand, last4: doc.payment.card.last4 } }
      : {}),
    ...(doc.payment.refundedAmount !== undefined
      ? { refundedAmount: doc.payment.refundedAmount }
      : {}),
    ...(doc.payment.refundedAt ? { refundedAt: doc.payment.refundedAt } : {}),
    ...(doc.payment.refundRequestedAt ? { refundRequestedAt: doc.payment.refundRequestedAt } : {}),
  },
  ...(doc.disputeStatus ? { disputeStatus: doc.disputeStatus } : {}),
  ...(doc.disputedAt ? { disputedAt: doc.disputedAt } : {}),
  shippingSelection: { ...doc.shippingSelection },
  parcel: { ...doc.parcel },
  ...(doc.label
    ? {
        label: {
          status: doc.label.status,
          attempts: doc.label.attempts,
          ...(doc.label.lastError ? { lastError: doc.label.lastError } : {}),
          ...(doc.label.trackingNumber ? { trackingNumber: doc.label.trackingNumber } : {}),
          ...(doc.label.carrier ? { carrier: doc.label.carrier } : {}),
          ...(doc.label.labelUrl ? { labelUrl: doc.label.labelUrl } : {}),
          ...(doc.label.trackUrl ? { trackUrl: doc.label.trackUrl } : {}),
          ...(doc.label.readyAt ? { readyAt: doc.label.readyAt } : {}),
          ...(doc.label.cancelledAt ? { cancelledAt: doc.label.cancelledAt } : {}),
        },
      }
    : {}),
  ...(doc.tracking
    ? {
        tracking: {
          status: doc.tracking.status,
          ...(doc.tracking.lastEventAt ? { lastEventAt: doc.tracking.lastEventAt } : {}),
          ...(doc.tracking.lastSyncedAt ? { lastSyncedAt: doc.tracking.lastSyncedAt } : {}),
        },
      }
    : {}),
  ...(doc.shippedAt ? { shippedAt: doc.shippedAt } : {}),
  ...(doc.deliveredAt ? { deliveredAt: doc.deliveredAt } : {}),
  updatedAt: doc.updatedAt,
});

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "total", "status", "priority"],
  // publicId is a credential: it is never searchable. The folio prefix is added below.
  searchable: ["customer.email", "customer.name", "customer.phone"],
  defaultSort: "-createdAt",
};

interface AdminOrderListQuery extends RawListQuery {
  /** One status or a comma-separated list. */
  status?: string;
  group?: OrderStatusGroup;
  priority?: OrderPriority;
  /** Exact folio, already uppercased by the validator. */
  orderNumber?: string;
}

/** `status` (CSV) and `group` both narrow the same field: when both come, they intersect. */
const buildStatusFilter = (
  csv: string | undefined,
  group: OrderStatusGroup | undefined,
): { $in: string[] } | undefined => {
  const byStatus = csv ? csv.split(",") : undefined;
  const byGroup = group ? [...ORDER_STATUS_GROUPS[group]] : undefined;
  if (byStatus && byGroup)
    return { $in: byStatus.filter((s) => byGroup.includes(s as OrderStatus)) };
  const list = byStatus ?? byGroup;
  return list ? { $in: list } : undefined;
};

const listAdminOrders = async (
  query: AdminOrderListQuery,
): Promise<{ items: AdminOrder[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  const status = buildStatusFilter(query.status, query.group);
  if (status) filters.status = status;
  if (query.priority) filters.priority = query.priority;
  if (query.orderNumber) filters.orderNumber = query.orderNumber;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);

  // parseListQuery only knows plain fields: the folio PREFIX joins the free-text search here.
  const term = typeof query.search === "string" ? query.search.trim().slice(0, 80) : "";
  if (term && Array.isArray(filter.$or)) {
    (filter.$or as Record<string, unknown>[]).push({
      orderNumber: new RegExp(`^${escapeRegex(term.toUpperCase())}`),
    });
  }

  const [docs, total] = await Promise.all([
    Order.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return {
    items: (docs as AdminOrderLean[]).map(toAdminOrder),
    meta: buildMeta(total, { page, limit }),
  };
};

/**
 * Triage only. A single atomic write that never touches `status`: priority sorts
 * the queue, it must never condition (or be conditioned by) a transition.
 */
const updateOrderPriority = async (
  id: string,
  priority: OrderPriority,
  ctx: RequestContext,
): Promise<AdminOrder> => {
  const before = await Order.findById(id).select("priority").lean();
  if (!before) throw new AppError("La orden no existe.", 404);

  const updated = await Order.findByIdAndUpdate(id, { $set: { priority } }, { new: true }).lean();
  if (!updated) throw new AppError("La orden no existe.", 404);

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.ORDER_PRIORITY_UPDATED,
    module: AuditModule.ORDERS,
    targetId: id,
    before: { priority: before.priority ?? OrderPriority.NORMAL },
    after: { priority },
    ip: ctx.ip,
  });
  return toAdminOrder(updated);
};

/**
 * Sequential on purpose (<= MAX_BULK_ORDERS): every order goes through the SAME
 * path as a single change (assert + atomic transition + customer email + its own
 * audit entry), so a lot can never do what one order could not.
 */
const bulkChangeStatus = async (
  ids: string[],
  status: OrderStatus,
  ctx: RequestContext,
): Promise<BulkStatusResult> => {
  const results: BulkStatusResult["results"] = [];
  for (const id of ids) {
    const order = await Order.findById(id).select("orderNumber status").lean();
    if (!order) {
      results.push({ id, orderNumber: "", outcome: "rejected", message: "La orden no existe." });
      continue;
    }
    if (order.status === status) {
      results.push({ id, orderNumber: order.orderNumber, outcome: "unchanged" });
      continue;
    }
    try {
      await changeOrderStatus(id, status, ctx);
      results.push({ id, orderNumber: order.orderNumber, outcome: "updated" });
    } catch (err) {
      // One bad order must not hide which of the others already changed.
      if (!(err instanceof AppError)) {
        logger.error({ err, orderId: id }, "Falló una orden dentro del cambio masivo");
      }
      results.push({
        id,
        orderNumber: order.orderNumber,
        outcome: "rejected",
        message: err instanceof AppError ? err.message : "No se pudo actualizar esta orden.",
      });
    }
  }
  const summary = { updated: 0, unchanged: 0, rejected: 0 };
  for (const result of results) summary[result.outcome] += 1;
  return { results, summary };
};

/** Statuses where the parcel has not left yet: past these the address is frozen. */
const ADDRESS_EDITABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
];

/**
 * The status guard lives IN THE FILTER, not in a read-then-write: a shipment created
 * between the check and the update could otherwise redirect a parcel already on its
 * way. The audit entry carries no address (PII).
 */
const updateShippingAddress = async (
  id: string,
  address: ShippingAddress,
  ctx: RequestContext,
): Promise<AdminOrder> => {
  const current = await Order.findById(id).select("status shipping.postalCode label.status").lean();
  if (!current) throw new AppError("La orden no existe.", 404);

  // The quote (and the carrier's price) were made for ONE postal code: a different
  // one means a different price, which a correction cannot silently absorb.
  if (current.shipping.postalCode !== address.postalCode) {
    throw new AppError(
      "No se puede cambiar el código postal: cambia el costo del envío. Cancela el pedido y créalo de nuevo.",
      409,
    );
  }
  if (current.label?.status === ShippingLabelStatus.REQUESTED) {
    throw new AppError("Se está generando la guía. Intenta de nuevo en un minuto.", 409);
  }

  // The status/label guards live IN THE FILTER, not in a read-then-write: a purchase
  // or shipment landing between the check and the update could otherwise redirect a
  // parcel already on its way. The audit entry carries no address (PII).
  const updated = await Order.findOneAndUpdate(
    {
      _id: id,
      status: { $in: ADDRESS_EDITABLE_STATUSES },
      "shipping.postalCode": address.postalCode,
      "label.status": { $ne: ShippingLabelStatus.REQUESTED },
    },
    { $set: { shipping: address } },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    throw new AppError(
      "La dirección ya no se puede corregir: la orden está enviada o cerrada, o se está generando la guía.",
      409,
    );
  }

  // A label bought for the old address is void: cancel it and buy a fresh one.
  if (current.label?.status === ShippingLabelStatus.READY) {
    await requestLabelCancellation(updated._id, { requeue: true });
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.ORDER_SHIPPING_ADDRESS_UPDATED,
    module: AuditModule.ORDERS,
    targetId: id,
    ip: ctx.ip,
  });
  return toAdminOrder(updated);
};

/**
 * Counts for the KPI cards. Deliberately NOT bounded by date: an order stuck for
 * two months is still stuck when the operator looks at "last 30 days".
 */
const getOrderSummary = async (): Promise<OrderSummary> => {
  const [grouped, disputed] = await Promise.all([
    Order.aggregate<{ _id: OrderStatus; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Order.countDocuments({ disputeStatus: DisputeStatus.OPEN }),
  ]);

  const countsByStatus = Object.fromEntries(
    Object.values(OrderStatus).map((status) => [status, 0]),
  ) as Record<OrderStatus, number>;
  for (const row of grouped) countsByStatus[row._id] = row.count;

  const byGroup: Record<OrderStatusGroup, number> = {
    action: 0,
    waiting: 0,
    shipping: 0,
    problems: 0,
  };
  for (const status of Object.values(OrderStatus)) {
    byGroup[ORDER_STATUS_TO_GROUP[status]] += countsByStatus[status];
  }
  return { countsByStatus, byGroup, disputed };
};

const getAdminOrder = async (id: string): Promise<AdminOrder> => {
  const doc = await Order.findById(id).lean();
  if (!doc) throw new AppError("La orden no existe.", 404);
  return toAdminOrder(doc);
};

/**
 * Cancelling a pending order from the panel closes the charging window FIRST.
 * The intent is cancelled before the order moves: if the provider refuses, the
 * order is untouched and the admin sees why, instead of a "cancelled" order a
 * customer can still pay. A refusal because the customer just paid is a 409,
 * not a 502 — the order is theirs now.
 */
const cancelPendingOrder = async (
  order: OrderDocument,
  ctx: RequestContext,
  reason: string | undefined,
): Promise<OrderDocument | null> => {
  const intentId = order.payment.intentId;
  if (intentId) {
    const provider = getPaymentProvider();
    try {
      await provider.cancelPayment(intentId);
    } catch (err) {
      let live: PaymentStatus | undefined;
      try {
        live = (await provider.getPayment(intentId)).status;
      } catch {
        // Cannot tell: treat it as the outage it most likely is.
      }
      if (live === PaymentStatus.SUCCEEDED || live === PaymentStatus.PROCESSING) {
        throw new AppError("El cliente acaba de pagar esta orden; no se puede cancelar.", 409);
      }
      // Already cancelled (an earlier attempt got this far, or the customer's
      // side did): the window is closed, so the order can follow.
      if (live !== PaymentStatus.CANCELLED) throw err;
    }
  }

  const moved = await applyOrderTransition({
    orderId: order._id,
    from: OrderStatus.PENDING_PAYMENT,
    to: OrderStatus.CANCELLED,
    actor: { type: "user", id: ctx.actorId },
    reason: "admin_cancelled",
    set: {
      "payment.status": PaymentStatus.CANCELLED,
      ...(reason ? { cancelReason: reason } : {}),
    },
  });
  // `payment_intent.canceled` can reach the webhook before this line: the order
  // is then already cancelled, and the admin's intent was honoured all the same.
  const settled = moved ?? (await Order.findOne({ _id: order._id, status: OrderStatus.CANCELLED }));
  if (!settled) return null;

  // The expiry sweep releases any hold left on a cancelled order, so a failure
  // here is recoverable and must not turn a cancelled order into an error page.
  await releaseReservation(order._id, "admin_cancelled").catch((err: unknown) => {
    logger.error(
      { err, orderId: String(order._id) },
      "No se pudo liberar la reserva de una orden cancelada",
    );
  });
  return settled;
};

/**
 * Payment-driven states (paid, refunded, expired) are rejected here
 * with 403 by assertAdminTransition — they belong to the webhook and the
 * reconciliation job, never to a human typing a status into a form.
 */
const changeOrderStatus = async (
  id: string,
  status: OrderStatus,
  ctx: RequestContext,
  reason?: string,
): Promise<AdminOrder> => {
  const order = await Order.findById(id);
  if (!order) throw new AppError("La orden no existe.", 404);

  assertAdminTransition(order.status, status);
  const before = order.status;
  const moved =
    status === OrderStatus.CANCELLED
      ? await cancelPendingOrder(order, ctx, reason)
      : await applyOrderTransition({
          orderId: order._id,
          from: before,
          to: status,
          actor: { type: "user", id: ctx.actorId },
        });
  if (!moved) {
    throw new AppError(
      "La orden cambió de estado mientras la editabas. Recarga e intenta de nuevo.",
      409,
    );
  }

  // Only PROCESSING triggers a customer email here; SHIPPED/DELIVERED belong to "Marcar enviado" and the carrier's tracking.
  if (status === OrderStatus.PROCESSING) {
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_PREPARING,
      to: order.customer.email,
      order: order._id,
      payload: toOrderEmailSnapshot(order) as unknown as Record<string, unknown>,
    });
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.ORDER_STATUS_CHANGED,
    module: AuditModule.ORDERS,
    targetId: String(order._id),
    before: { status: before },
    after: { status },
    ip: ctx.ip,
  });

  return toAdminOrder(moved.toObject());
};

const REFUNDABLE_STATUSES = new Set<OrderStatus>([
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

/**
 * Requesting a refund only ASKS the provider. The order does not become
 * `refunded` here: that state arrives via charge.refunded on the webhook,
 * same as every other payment truth. Flipping it optimistically would let a
 * failed refund leave the books saying money went back when it did not.
 */
const requestRefund = async (id: string, ctx: RequestContext): Promise<AdminOrder> => {
  const requestedAt = new Date();
  // The claim is the guard: a second request while the webhook is pending (or a
  // parallel one) matches nothing. A request the webhook never confirmed is
  // retryable once it is stale.
  const order: OrderDocument | null = await Order.findOneAndUpdate(
    {
      _id: id,
      status: { $in: [...REFUNDABLE_STATUSES] },
      "payment.intentId": { $exists: true, $ne: null },
      $or: [
        { "payment.refundRequestedAt": { $exists: false } },
        {
          "payment.refundRequestedAt": {
            $lt: new Date(requestedAt.getTime() - REFUND_REQUEST_STALE_MS),
          },
        },
      ],
    },
    { $set: { "payment.refundRequestedAt": requestedAt } },
    { new: true },
  );
  if (!order) {
    const current = await Order.findById(id).select(
      "status payment.intentId payment.refundRequestedAt",
    );
    if (!current) throw new AppError("La orden no existe.", 404);
    if (!current.payment.intentId || !REFUNDABLE_STATUSES.has(current.status)) {
      throw new AppError("Solo se puede reembolsar una orden que ya fue cobrada.", 409);
    }
    throw new AppError("Ya hay un reembolso en curso para esta orden.", 409);
  }

  try {
    await getPaymentProvider().refundPayment(order.payment.intentId as string);
  } catch (err) {
    // Release only our own claim, so a retry is possible right away.
    await Order.updateOne(
      { _id: order._id, "payment.refundRequestedAt": requestedAt },
      { $unset: { "payment.refundRequestedAt": 1 } },
    );
    throw err;
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.ORDER_REFUND_REQUESTED,
    module: AuditModule.PAYMENTS,
    targetId: String(order._id),
    ip: ctx.ip,
  });

  return toAdminOrder(order.toObject());
};

const ORDER_ACTIVITY_MODULES = [AuditModule.ORDERS, AuditModule.PAYMENTS, AuditModule.SHIPPING];

/**
 * "Who did what and when" for one order. Deliberately without before/after (they
 * are Mixed and can carry PII such as a full address) and without ip.
 */
const getOrderActivity = async (id: string): Promise<OrderActivityEntry[]> => {
  const exists = await Order.exists({ _id: id });
  if (!exists) throw new AppError("La orden no existe.", 404);

  const rows = await AuditLog.find({ targetId: id, module: { $in: ORDER_ACTIVITY_MODULES } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_ORDER_ACTIVITY)
    .select("action actorType actorId createdAt")
    .lean();

  return rows.map((row) => ({
    action: row.action,
    actorType: row.actorType,
    ...(row.actorId ? { actorId: String(row.actorId) } : {}),
    createdAt: row.createdAt,
  }));
};

export type { AdminOrder, AdminOrderListQuery };
export {
  listAdminOrders,
  getOrderSummary,
  getAdminOrder,
  changeOrderStatus,
  requestRefund,
  getOrderActivity,
  updateOrderPriority,
  updateShippingAddress,
  bulkChangeStatus,
};
