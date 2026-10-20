import { createHash } from "node:crypto";
import type { Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  DisputeStatus,
  NotificationChannelKind,
  NotificationType,
  OrderStatus,
  SHIPMENT_TRACKING_STATUS_LABELS,
  SHIPPING_CARRIER_LABELS,
  ShipmentTrackingStatus as S,
  ShippingLabelStatus,
  type AdminOrder,
  type AdminOrderTracking,
  type PublicTrackingView,
  type TrackingEventDto,
} from "@gira/shared";
import { Order, type OrderDocument } from "../models/Order.js";
import { ShipmentTrackingEvent } from "../models/ShipmentTrackingEvent.js";
import type { TrackingEvent } from "../adapters/shipping/types.js";
import { AppError } from "../utils/AppError.js";
import { assertShipmentDrivenTransition } from "../utils/orderTransitions.js";
import { canAdvanceTracking } from "../utils/trackingProgress.js";
import { toShipmentEmailSnapshot } from "../utils/orderEmailSnapshot.js";
import type { RequestContext } from "../utils/requestContext.js";
import { applyOrderTransition } from "./orderTransitionService.js";
import { enqueueNotification } from "./notificationService.js";
import { recordAudit } from "./auditService.js";
import { getAdminOrder } from "./adminOrderService.js";
import { logger } from "../config/logger.js";

/**
 * Single writer of parcel progress. Webhook and polling both end here, so they
 * cannot disagree: events are stored idempotently, `Order.tracking` only moves
 * forward, and the order's status converges through `applyOrderTransition`
 * (CAS), which makes a webhook/poll/"Marcar enviado" race harmless — the loser
 * gets `null` and re-reads.
 */

/** A provider event plus the idempotency key it arrived with. */
interface IncomingTrackingEvent extends TrackingEvent {
  providerEventId?: string;
}

const BLOCKING_DISPUTES: ReadonlySet<DisputeStatus> = new Set([
  DisputeStatus.OPEN,
  DisputeStatus.LOST,
]);
const DEAD_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.REFUNDED,
  OrderStatus.CANCELLED,
  OrderStatus.EXPIRED,
]);
const IN_MOTION: ReadonlySet<S> = new Set([S.PICKED_UP, S.IN_TRANSIT, S.OUT_FOR_DELIVERY]);
const INCIDENTS: ReadonlySet<S> = new Set([S.EXCEPTION, S.RETURNED, S.LOST]);
const MAX_TRACKING_EVENTS = 100;
const MAX_TRACKING_CAS_ATTEMPTS = 3;
const MAX_CONVERGE_ATTEMPTS = 3;
/** Atomic dispute guard, added to every automatic transition. */
const NO_BLOCKING_DISPUTE = { disputeStatus: { $nin: [...BLOCKING_DISPUTES] } };

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;

/** Polling has no delivery id: a stable hash makes repeated runs insert once. */
const syntheticEventId = (e: TrackingEvent): string =>
  createHash("sha256")
    .update(`${e.trackingNumber}|${e.rawStatus}|${e.occurredAt.toISOString()}`)
    .digest("hex")
    .slice(0, 32);

const SYSTEM = { type: "system" as const };

/**
 * `strict` makes a failed enqueue throw (webhook answers 500 / poll fails, the event is
 * redelivered and `converge` heals it); a duplicate (already queued) is never an error.
 */
const queueShipmentEmail = async (
  order: OrderDocument,
  type: NotificationType,
  strict = false,
): Promise<void> => {
  const snapshot = toShipmentEmailSnapshot(order);
  if (!snapshot) {
    logger.warn(
      { orderId: String(order._id), type },
      "Orden sin guía utilizable: no se encoló el correo",
    );
    return;
  }
  await enqueueNotification(
    {
      channel: NotificationChannelKind.EMAIL,
      type,
      to: order.customer.email,
      order: order._id,
      payload: snapshot as unknown as Record<string, unknown>,
    },
    { strict },
  );
};

/** paid -> processing (skipped if already there) -> shipped. Null when someone else moved the order meanwhile. */
const advanceToShipped = async (
  order: OrderDocument,
  firstScanAt: Date,
): Promise<OrderDocument | null> => {
  let current: OrderDocument | null = order;
  if (current.status === OrderStatus.PAID) {
    current = await applyOrderTransition({
      orderId: current._id,
      from: OrderStatus.PAID,
      to: OrderStatus.PROCESSING,
      actor: SYSTEM,
      reason: "carrier_picked_up",
      where: NO_BLOCKING_DISPUTE,
    });
    if (!current) return null;
  }
  assertShipmentDrivenTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED);
  return applyOrderTransition({
    orderId: current._id,
    from: OrderStatus.PROCESSING,
    to: OrderStatus.SHIPPED,
    actor: SYSTEM,
    reason: "carrier_picked_up",
    set: { shippedAt: firstScanAt },
    where: NO_BLOCKING_DISPUTE,
  });
};

const advanceToDelivered = async (
  order: OrderDocument,
  at: Date,
): Promise<OrderDocument | null> => {
  const shippedNow = order.status !== OrderStatus.SHIPPED;
  const shipped = shippedNow ? await advanceToShipped(order, at) : order;
  if (!shipped) return null;
  assertShipmentDrivenTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED);
  return applyOrderTransition({
    orderId: shipped._id,
    from: OrderStatus.SHIPPED,
    to: OrderStatus.DELIVERED,
    actor: SYSTEM,
    reason: "carrier_delivered",
    set: { deliveredAt: at },
    where: NO_BLOCKING_DISPUTE,
  });
};

/**
 * Moves the order to match a parcel event. Idempotent: every step is a CAS from a
 * specific status and emails dedupe on (order, type), so it is safe to re-run for a
 * duplicate event. A lost chain race re-reads the order and re-evaluates (bounded).
 */
const converge = async (orderId: Types.ObjectId, event: TrackingEvent): Promise<void> => {
  const initial = await Order.findById(orderId);
  if (!initial) return;

  if (INCIDENTS.has(event.status)) {
    await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_SHIPMENT_INCIDENT,
      to: "team",
      order: initial._id,
      payload: {
        orderNumber: initial.orderNumber,
        status: SHIPMENT_TRACKING_STATUS_LABELS[event.status],
        carrier: initial.label?.carrier ? SHIPPING_CARRIER_LABELS[initial.label.carrier] : "—",
      },
    });
    return;
  }

  const wantsShipped = IN_MOTION.has(event.status);
  const wantsDelivered = event.status === S.DELIVERED;
  if (!wantsShipped && !wantsDelivered) return;

  for (let attempt = 0; attempt < MAX_CONVERGE_ATTEMPTS; attempt += 1) {
    const order = attempt === 0 ? initial : await Order.findById(orderId);
    if (!order || DEAD_STATUSES.has(order.status)) return;

    if (order.disputeStatus && BLOCKING_DISPUTES.has(order.disputeStatus)) {
      await recordAudit({
        actorType: "system",
        action: AuditAction.TRACKING_TRANSITION_BLOCKED,
        module: AuditModule.SHIPPING,
        targetId: String(order._id),
        after: { tracking: event.status, dispute: order.disputeStatus },
      });
      return;
    }

    if (wantsShipped) {
      // Self-heal: already shipped (e.g. the enqueue failed after the transition) -> make
      // sure the email exists. Idempotent through the (order, type) unique index.
      if (order.status === OrderStatus.SHIPPED) {
        await queueShipmentEmail(order, NotificationType.ORDER_SHIPPED, true);
        return;
      }
      if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PROCESSING) return;
      const moved = await advanceToShipped(order, event.occurredAt);
      if (moved) {
        await queueShipmentEmail(moved, NotificationType.ORDER_SHIPPED, true);
        return;
      }
      continue;
    }

    if (order.status === OrderStatus.DELIVERED) {
      await queueShipmentEmail(order, NotificationType.ORDER_DELIVERED, true);
      return;
    }
    if (![OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED].includes(order.status))
      return;
    const moved = await advanceToDelivered(order, event.occurredAt);
    if (moved) {
      await queueShipmentEmail(moved, NotificationType.ORDER_DELIVERED, true);
      return;
    }
  }
};

/** Stores one event and advances `Order.tracking` if it is newer. Returns false for a duplicate. */
const recordEvent = async (
  provider: string,
  order: OrderDocument,
  event: IncomingTrackingEvent,
): Promise<boolean> => {
  try {
    await ShipmentTrackingEvent.create({
      order: order._id,
      provider,
      // One natural key for the fact, whichever path (webhook or polling) delivered it.
      providerEventId: syntheticEventId(event),
      trackingNumber: event.trackingNumber,
      status: event.status,
      rawStatus: event.rawStatus.slice(0, 200),
      ...(event.description ? { description: event.description.slice(0, 500) } : {}),
      ...(event.location ? { location: event.location.slice(0, 200) } : {}),
      occurredAt: event.occurredAt,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) return false;
    throw err;
  }

  // CAS on the exact tracking we read: a concurrent writer that advanced it first wins the
  // write, but this event may still be newer than what it wrote, so re-read and re-evaluate
  // (bounded) instead of silently dropping the progress.
  let snapshot: OrderDocument["tracking"] = order.tracking;
  for (let attempt = 0; attempt < MAX_TRACKING_CAS_ATTEMPTS; attempt += 1) {
    const current = snapshot
      ? { status: snapshot.status, lastEventAt: snapshot.lastEventAt }
      : undefined;
    if (!canAdvanceTracking(current, event)) return true;

    const guard = snapshot
      ? {
          "tracking.status": snapshot.status,
          ...(snapshot.lastEventAt
            ? { "tracking.lastEventAt": snapshot.lastEventAt }
            : { "tracking.lastEventAt": { $exists: false } }),
        }
      : { tracking: { $exists: false } };
    const advanced = await Order.updateOne(
      { _id: order._id, ...guard },
      { $set: { "tracking.status": event.status, "tracking.lastEventAt": event.occurredAt } },
    );
    if (advanced.modifiedCount > 0) {
      await recordAudit({
        actorType: "system",
        action: AuditAction.TRACKING_UPDATED,
        module: AuditModule.SHIPPING,
        targetId: String(order._id),
        before: { tracking: snapshot?.status ?? null },
        after: { tracking: event.status },
      });
      return true;
    }
    const reread = await Order.findById(order._id).select("tracking").lean();
    if (!reread) return true;
    snapshot = reread.tracking;
  }
  return true;
};

/**
 * Webhook and polling entry. Each event runs on a fresh read of the order so a
 * batch of events for one parcel sees the effect of the previous one.
 */
const applyTrackingEvents = async (
  provider: string,
  events: IncomingTrackingEvent[],
): Promise<void> => {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  for (const event of ordered) {
    const order = await Order.findOne({ "label.trackingNumber": event.trackingNumber });
    if (!order) {
      logger.warn({ provider, status: event.status }, "Evento de rastreo sin orden");
      continue;
    }
    // A duplicate still converges: the first delivery may have crashed (or been blocked by a
    // dispute) after storing the event, and converge is idempotent.
    await recordEvent(provider, order, event);
    await converge(order._id, event);
  }
};

/** "Marcar enviado": the owner confirms the parcel left, using the label already bought. */
const markShipped = async (orderId: string, ctx: RequestContext): Promise<AdminOrder> => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError("La orden no existe.", 404);
  if (order.status !== OrderStatus.PROCESSING) {
    throw new AppError("Primero marca el pedido «en preparación».", 409);
  }
  if (order.label?.status !== ShippingLabelStatus.READY || !order.label.trackingNumber) {
    throw new AppError("La guía todavía no está lista para este pedido.", 409);
  }
  if (order.disputeStatus && BLOCKING_DISPUTES.has(order.disputeStatus)) {
    throw new AppError("El pedido tiene una disputa; resuélvela antes de enviarlo.", 409);
  }

  assertShipmentDrivenTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED);
  const moved = await applyOrderTransition({
    orderId: order._id,
    from: OrderStatus.PROCESSING,
    to: OrderStatus.SHIPPED,
    actor: { type: "user", id: ctx.actorId },
    reason: "marked_shipped",
    set: { shippedAt: new Date() },
    where: {
      "label.status": ShippingLabelStatus.READY,
      "label.trackingNumber": order.label.trackingNumber,
      disputeStatus: { $nin: [...BLOCKING_DISPUTES] },
    },
  });
  if (!moved) {
    throw new AppError("El pedido cambió mientras lo editabas. Recarga e intenta de nuevo.", 409);
  }

  await queueShipmentEmail(moved, NotificationType.ORDER_SHIPPED);
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.ORDER_MARKED_SHIPPED,
    module: AuditModule.SHIPPING,
    targetId: String(moved._id),
    ip: ctx.ip,
  });
  return getAdminOrder(String(moved._id));
};

const toEventDto = (e: {
  status: S;
  rawStatus: string;
  description?: string | undefined;
  location?: string | undefined;
  occurredAt: Date;
}): TrackingEventDto => ({
  status: e.status,
  rawStatus: e.rawStatus,
  ...(e.description ? { description: e.description } : {}),
  ...(e.location ? { location: e.location } : {}),
  occurredAt: e.occurredAt,
});

const loadEvents = async (orderId: Types.ObjectId, limit: number): Promise<TrackingEventDto[]> => {
  const rows = await ShipmentTrackingEvent.find({ order: orderId })
    .sort({ occurredAt: -1 })
    .limit(limit)
    .lean();
  return rows.reverse().map(toEventDto);
};

/** `GET /admin/orders/:id/tracking`. */
const getAdminTracking = async (orderId: string): Promise<AdminOrderTracking> => {
  const order = await Order.findById(orderId).lean();
  if (!order) throw new AppError("La orden no existe.", 404);
  const admin = await getAdminOrder(orderId);
  return {
    ...(admin.label ? { label: admin.label } : {}),
    ...(admin.tracking ? { tracking: admin.tracking } : {}),
    ...(admin.shippedAt ? { shippedAt: admin.shippedAt } : {}),
    ...(admin.deliveredAt ? { deliveredAt: admin.deliveredAt } : {}),
    events: await loadEvents(order._id, MAX_TRACKING_EVENTS),
  };
};

/**
 * Public tracking by capability id. The SAME 404 whether the order does not exist
 * or has not shipped yet: distinguishing them would be an order-existence oracle.
 */
const getPublicTracking = async (publicId: string): Promise<PublicTrackingView> => {
  const order = await Order.findOne({ publicId }).lean();
  const visible =
    order && (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED);
  if (!visible || !order.label?.trackingNumber || !order.label.carrier) {
    throw new AppError("Todavía no hay información de envío para este pedido.", 404);
  }
  return {
    orderNumber: order.orderNumber,
    carrier: order.label.carrier,
    carrierName: SHIPPING_CARRIER_LABELS[order.label.carrier],
    trackingNumber: order.label.trackingNumber,
    ...(order.label.trackUrl ? { trackUrl: order.label.trackUrl } : {}),
    ...(order.tracking ? { status: order.tracking.status } : {}),
    ...(order.shippedAt ? { shippedAt: order.shippedAt } : {}),
    ...(order.deliveredAt ? { deliveredAt: order.deliveredAt } : {}),
    events: await loadEvents(order._id, MAX_TRACKING_EVENTS),
  };
};

export type { IncomingTrackingEvent };
export { syntheticEventId, applyTrackingEvents, markShipped, getAdminTracking, getPublicTracking };
