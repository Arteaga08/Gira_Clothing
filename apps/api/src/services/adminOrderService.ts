import type { Types } from "mongoose";
import type { ApiMeta } from "@gira/shared";
import {
  AuditAction,
  AuditModule,
  NotificationChannelKind,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  type CustomerOrder,
  type DisputeStatus,
} from "@gira/shared";
import { Order, type OrderDocument } from "../models/Order.js";
import { AppError } from "../utils/AppError.js";
import { assertAdminTransition } from "../utils/orderTransitions.js";
import { applyOrderTransition } from "./orderTransitionService.js";
import { getPaymentProvider } from "../adapters/payment/index.js";
import { recordAudit } from "./auditService.js";
import { enqueueNotification } from "./notificationService.js";
import { releaseReservation } from "./reservationService.js";
import { logger } from "../config/logger.js";
import { parseListQuery, buildMeta, type ListQueryConfig, type RawListQuery } from "../utils/parseListQuery.js";
import { toCustomerOrder, type OrderLean } from "./orderService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * Admin view of an order — everything the public/customer DTO withholds
 * (payment.intentId, statusHistory, the owning user) is legitimate here: this
 * is the operational panel, not a customer-facing endpoint.
 */
interface PublicAdminOrder extends CustomerOrder {
  user?: string;
  statusHistory: { status: OrderStatus; at: Date; reason?: string }[];
  payment: {
    provider: string;
    intentId?: string;
    status: string;
    lastError?: string;
    refundedAmount?: number;
    refundedAt?: Date;
  };
  disputeStatus?: DisputeStatus;
  disputedAt?: Date;
  updatedAt: Date;
}

interface AdminOrderLean extends OrderLean {
  user?: Types.ObjectId;
  statusHistory: { status: OrderStatus; at: Date; reason?: string }[];
  payment: {
    provider: string;
    intentId?: string;
    status: string;
    lastError?: string;
    refundedAmount?: number;
    refundedAt?: Date;
  };
  disputeStatus?: DisputeStatus;
  disputedAt?: Date;
  updatedAt: Date;
}

const toPublicAdminOrder = (doc: AdminOrderLean): PublicAdminOrder => ({
  ...toCustomerOrder(doc),
  ...(doc.user ? { user: String(doc.user) } : {}),
  statusHistory: doc.statusHistory,
  payment: doc.payment,
  ...(doc.disputeStatus ? { disputeStatus: doc.disputeStatus } : {}),
  ...(doc.disputedAt ? { disputedAt: doc.disputedAt } : {}),
  updatedAt: doc.updatedAt,
});

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "total", "status"],
  searchable: ["customer.email", "publicId"],
  defaultSort: "-createdAt",
};

interface AdminOrderListQuery extends RawListQuery {
  status?: OrderStatus;
}

const listAdminOrders = async (
  query: AdminOrderListQuery,
): Promise<{ items: PublicAdminOrder[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.status) filters.status = query.status;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    Order.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return {
    items: (docs as AdminOrderLean[]).map(toPublicAdminOrder),
    meta: buildMeta(total, { page, limit }),
  };
};

const getAdminOrder = async (id: string): Promise<PublicAdminOrder> => {
  const doc = await Order.findById(id).lean();
  if (!doc) throw new AppError("La orden no existe.", 404);
  return toPublicAdminOrder(doc);
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
    set: { "payment.status": PaymentStatus.CANCELLED },
  });
  // `payment_intent.canceled` can reach the webhook before this line: the order
  // is then already cancelled, and the admin's intent was honoured all the same.
  const settled = moved ?? (await Order.findOne({ _id: order._id, status: OrderStatus.CANCELLED }));
  if (!settled) return null;

  // The expiry sweep releases any hold left on a cancelled order, so a failure
  // here is recoverable and must not turn a cancelled order into an error page.
  await releaseReservation(order._id, "admin_cancelled").catch((err: unknown) => {
    logger.error({ err, order: order.publicId }, "No se pudo liberar la reserva de una orden cancelada");
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
): Promise<PublicAdminOrder> => {
  const order = await Order.findById(id);
  if (!order) throw new AppError("La orden no existe.", 404);

  assertAdminTransition(order.status, status);
  const before = order.status;
  const moved =
    status === OrderStatus.CANCELLED
      ? await cancelPendingOrder(order, ctx)
      : await applyOrderTransition({
          orderId: order._id,
          from: before,
          to: status,
          actor: { type: "user", id: ctx.actorId },
        });
  if (!moved) {
    throw new AppError("La orden cambió de estado mientras la editabas. Recarga e intenta de nuevo.", 409);
  }

  // Only PROCESSING triggers a customer email here; SHIPPED belongs to the
  // shipment flow, which owns the tracking data the email needs.
  if (status === OrderStatus.PROCESSING) {
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_PREPARING,
      to: order.customer.email,
      order: order._id,
      payload: {
        publicId: order.publicId,
        customerName: order.customer.name,
        currency: order.currency,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        total: order.total,
        lines: order.lines.map((line) => ({
          productName: line.productName,
          printName: line.printName,
          qty: line.qty,
          lineTotal: line.lineTotal,
        })),
      },
    });
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.ORDER_STATUS_CHANGED,
    module: AuditModule.ORDERS,
    targetId: order.publicId,
    before: { status: before },
    after: { status },
    ip: ctx.ip,
  });

  return toPublicAdminOrder(moved.toObject());
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
const requestRefund = async (id: string, ctx: RequestContext): Promise<PublicAdminOrder> => {
  const order: OrderDocument | null = await Order.findById(id);
  if (!order) throw new AppError("La orden no existe.", 404);
  if (!order.payment.intentId || !REFUNDABLE_STATUSES.has(order.status)) {
    throw new AppError("Solo se puede reembolsar una orden que ya fue cobrada.", 409);
  }

  await getPaymentProvider().refundPayment(order.payment.intentId);

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.ORDER_REFUND_REQUESTED,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
    ip: ctx.ip,
  });

  return toPublicAdminOrder(order.toObject());
};

export type { PublicAdminOrder, AdminOrderListQuery };
export { listAdminOrders, getAdminOrder, changeOrderStatus, requestRefund };
