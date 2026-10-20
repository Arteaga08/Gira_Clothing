import type { Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  DisputeStatus,
  NotificationChannelKind,
  NotificationType,
  OrderStatus,
  ShippingLabelStatus,
} from "@gira/shared";
import { getShippingProvider, ShippingProviderError } from "../adapters/shipping/index.js";
import type { LabelResult } from "../adapters/shipping/index.js";
import { Order, type OrderDocument } from "../models/Order.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/AppError.js";
import type { RequestContext } from "../utils/requestContext.js";
import { recordAudit } from "./auditService.js";
import { enqueueNotification } from "./notificationService.js";
import { getSettings } from "./settingsService.js";

/**
 * Buys, retries and cancels the shipping label of an order.
 *
 * Money rules: the provider has NO idempotency key, so the only guard against a
 * double purchase is OUR atomic claim (`pending|failed` -> `requested`, which
 * also bumps `attempts`) plus never retrying an uncertain outcome. Results are
 * written fenced on (requestedAt, attempts): a late reply from an old attempt
 * cannot overwrite a newer one — except a late SUCCESS, which is always kept
 * because the label was already paid for.
 */

const LABEL_MAX_ATTEMPTS = 5;
const LABEL_BACKOFF_BASE_MS = 5 * 60 * 1000;
/** A `requested` label older than this lost its worker; the job sends it to review. */
const LABEL_LEASE_MS = 10 * 60 * 1000;
const CANCEL_MAX_ATTEMPTS = 3;
const CANCEL_LEASE_MS = 10 * 60 * 1000;

/** The parcel can still be labelled only while it has not left. */
const LABELABLE = [OrderStatus.PAID, OrderStatus.PROCESSING];
/** An open or lost chargeback freezes shipping decisions. */
const BLOCKING_DISPUTES = [DisputeStatus.OPEN, DisputeStatus.LOST];
const DEAD_STATUSES = [OrderStatus.REFUNDED, OrderStatus.CANCELLED, OrderStatus.EXPIRED];

const backoffDate = (attempt: number): Date =>
  new Date(Date.now() + LABEL_BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));

/** Tests await the fire-and-forget work through this registry. */
const inflight = new Set<Promise<unknown>>();
const track = (work: Promise<unknown>): void => {
  const tracked: Promise<unknown> = work.finally(() => inflight.delete(tracked));
  inflight.add(tracked);
};
const settleLabelWork = async (): Promise<void> => {
  while (inflight.size > 0) await Promise.allSettled([...inflight]);
};

const fence = (o: OrderDocument) => ({
  _id: o._id,
  "label.status": ShippingLabelStatus.REQUESTED,
  "label.requestedAt": o.label?.requestedAt,
  "label.attempts": o.label?.attempts,
});

const claimLabel = (orderId: Types.ObjectId | string): Promise<OrderDocument | null> =>
  Order.findOneAndUpdate(
    {
      _id: orderId,
      status: { $in: LABELABLE },
      disputeStatus: { $nin: BLOCKING_DISPUTES },
      "label.status": { $in: [ShippingLabelStatus.PENDING, ShippingLabelStatus.FAILED] },
      "label.nextAttemptAt": { $lte: new Date() },
    },
    {
      $set: { "label.status": ShippingLabelStatus.REQUESTED, "label.requestedAt": new Date() },
      $inc: { "label.attempts": 1 },
    },
    { new: true },
  );

/** One alert per order: the outbox's unique (order, type) index is the dedupe. */
const alertNeedsReview = async (
  order: { _id: Types.ObjectId; orderNumber: string },
  reason: string,
): Promise<void> => {
  await enqueueNotification({
    channel: NotificationChannelKind.TEAM,
    type: NotificationType.TEAM_SHIPPING_LABEL_FAILED,
    to: "team",
    order: order._id,
    payload: { orderNumber: order.orderNumber, reason },
  });
  await recordAudit({
    actorType: "system",
    action: AuditAction.LABEL_NEEDS_REVIEW,
    module: AuditModule.SHIPPING,
    targetId: String(order._id),
    after: { reason },
  });
};

const failLabel = async (
  claimed: OrderDocument,
  message: string,
  terminal: boolean,
): Promise<void> => {
  const attempts = claimed.label?.attempts ?? 1;
  const toReview = terminal || attempts >= LABEL_MAX_ATTEMPTS;
  const text = message.slice(0, 500);
  const result = await Order.updateOne(fence(claimed), {
    $set: toReview
      ? { "label.status": ShippingLabelStatus.NEEDS_REVIEW, "label.lastError": text }
      : {
          "label.status": ShippingLabelStatus.FAILED,
          "label.lastError": text,
          "label.nextAttemptAt": backoffDate(attempts),
        },
  });
  if (result.modifiedCount === 0) return; // superseded: a newer state owns the label now
  await recordAudit({
    actorType: "system",
    action: AuditAction.LABEL_FAILED,
    module: AuditModule.SHIPPING,
    targetId: String(claimed._id),
    after: { attempts, reason: text },
  });
  if (toReview) await alertNeedsReview(claimed, text);
};

const recordReady = async (claimed: OrderDocument, result: LabelResult): Promise<void> => {
  const set = {
    "label.status": ShippingLabelStatus.READY,
    "label.providerShipmentId": result.providerShipmentId,
    "label.trackingNumber": result.trackingNumber,
    "label.carrier": result.carrier,
    "label.labelUrl": result.labelUrl,
    "label.trackUrl": result.trackUrl,
    "label.costMxn": result.costMxn,
    "label.readyAt": new Date(),
  };
  const unset = { "label.lastError": "", "label.nextAttemptAt": "" };

  let written = await Order.updateOne(fence(claimed), { $set: set, $unset: unset });
  if (written.modifiedCount === 0) {
    // The lease job gave up on this attempt while the provider was still working:
    // the money is spent, so keep the label as long as the order has none yet.
    written = await Order.updateOne(
      {
        _id: claimed._id,
        "label.trackingNumber": { $exists: false },
        "label.status": {
          $in: [
            ShippingLabelStatus.NEEDS_REVIEW,
            ShippingLabelStatus.FAILED,
            ShippingLabelStatus.PENDING,
          ],
        },
      },
      { $set: set, $unset: unset },
    );
  }
  if (written.modifiedCount === 0) {
    // A second purchase landed on an order that already has a label: flag it.
    await alertNeedsReview(claimed, `duplicate_label:${result.trackingNumber}`);
    return;
  }
  await recordAudit({
    actorType: "system",
    action: AuditAction.LABEL_CREATED,
    module: AuditModule.SHIPPING,
    targetId: String(claimed._id),
    after: { carrier: result.carrier },
  });
  // The order may have died (refund) while the purchase was in flight.
  await cancelIfOrderDead(claimed._id);
};

const toDestination = (o: OrderDocument) => ({
  name: o.shipping.recipient,
  phone: o.customer.phone,
  email: o.customer.email,
  line1: o.shipping.line1,
  ...(o.shipping.line2 ? { line2: o.shipping.line2 } : {}),
  district: o.shipping.district,
  city: o.shipping.city,
  state: o.shipping.state,
  postalCode: o.shipping.postalCode,
});

type PurchaseOutcome = "purchased" | "failed" | "skipped";

const purchaseLabelForOrder = async (
  orderId: Types.ObjectId | string,
): Promise<PurchaseOutcome> => {
  const claimed = await claimLabel(orderId);
  if (!claimed) return "skipped";

  const settings = await getSettings();
  const origin = settings.shipping.origin;
  if (!origin) {
    await failLabel(claimed, "origin_not_configured", true);
    return "failed";
  }
  const provider = getShippingProvider();
  if (claimed.shippingSelection.provider !== provider.name) {
    await failLabel(claimed, "provider_mismatch", true);
    return "failed";
  }

  try {
    const result = await provider.createLabel(
      {
        orderRef: claimed.orderNumber,
        origin: {
          name: origin.name,
          phone: origin.phone,
          ...(origin.email ? { email: origin.email } : {}),
          line1: origin.line1,
          district: origin.district,
          city: origin.city,
          state: origin.state,
          postalCode: origin.postalCode,
        },
        destination: toDestination(claimed),
        parcel: {
          weightGrams: claimed.parcel.weightGrams,
          lengthCm: claimed.parcel.lengthCm,
          widthCm: claimed.parcel.widthCm,
          heightCm: claimed.parcel.heightCm,
        },
        declaredValueMxn: claimed.lines.reduce((sum, l) => sum + l.unitPriceMxn * l.qty, 0),
        carrier: claimed.shippingSelection.carrier,
        service: claimed.shippingSelection.service,
      },
      {},
    );
    await recordReady(claimed, result);
    return "purchased";
  } catch (err) {
    if (err instanceof ShippingProviderError) {
      await failLabel(claimed, err.message, err.kind !== "unavailable");
    } else {
      logger.error({ err, orderId: String(claimed._id) }, "Error inesperado al comprar la guía");
      await failLabel(claimed, "unexpected_error", true);
    }
    return "failed";
  }
};

/** Fire-and-forget: a slow carrier must never delay the payment flow that triggered it. */
const triggerLabelPurchase = (orderId: Types.ObjectId | string): void => {
  track(
    purchaseLabelForOrder(orderId).catch((err: unknown) =>
      logger.error({ err, orderId: String(orderId) }, "No se pudo disparar la compra de guía"),
    ),
  );
};

/** Idempotent: queues a label for a paid order that has none, then tries right away. */
const enqueueLabel = async (orderId: Types.ObjectId | string): Promise<void> => {
  const queued = await Order.updateOne(
    { _id: orderId, status: { $in: LABELABLE }, label: { $exists: false } },
    {
      $set: {
        label: {
          status: ShippingLabelStatus.PENDING,
          attempts: 0,
          cancelAttempts: 0,
          nextAttemptAt: new Date(),
        },
      },
    },
  );
  if (queued.modifiedCount > 0) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.LABEL_REQUESTED,
      module: AuditModule.SHIPPING,
      targetId: String(orderId),
    });
  }
  triggerLabelPurchase(orderId);
};

/** Admin: put a failed / needs_review label (never one with a guide) back in the queue. */
const retryLabel = async (orderId: string, ctx: RequestContext): Promise<void> => {
  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: { $in: LABELABLE },
      "label.status": { $in: [ShippingLabelStatus.FAILED, ShippingLabelStatus.NEEDS_REVIEW] },
      "label.trackingNumber": { $exists: false },
    },
    {
      $set: {
        "label.status": ShippingLabelStatus.PENDING,
        "label.attempts": 0,
        "label.nextAttemptAt": new Date(),
      },
      $unset: { "label.lastError": "" },
    },
    { new: true },
  );
  if (!updated) {
    if (!(await Order.exists({ _id: orderId }))) throw new AppError("La orden no existe.", 404);
    throw new AppError("La guía de esta orden no se puede reintentar en este estado.", 409);
  }
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.LABEL_RETRY_REQUESTED,
    module: AuditModule.SHIPPING,
    targetId: String(updated._id),
    ip: ctx.ip,
  });
  triggerLabelPurchase(updated._id);
};

/** A `requested` label whose worker is gone: outcome unknown -> a human decides. */
const failStaleLease = async (order: OrderDocument): Promise<void> => {
  const moved = await Order.updateOne(fence(order), {
    $set: {
      "label.status": ShippingLabelStatus.NEEDS_REVIEW,
      "label.lastError": "lease_expired",
    },
  });
  if (moved.modifiedCount > 0) await alertNeedsReview(order, "lease_expired");
};

// ── Cancellation ────────────────────────────────────────────────────────────

type CancelRequestOutcome = "cancelling" | "closed" | "in_flight" | "needs_review" | "noop";

/**
 * Starts the cancellation of an order's label.
 *  - ready            -> cancel_pending (the provider call runs next)
 *  - pending / failed -> nothing was bought: closed locally, no provider call
 *  - requested        -> a purchase is in flight: `recordReady` cancels it on arrival
 *  - needs_review     -> a human already has the alert; never auto-resolved
 */
const requestLabelCancellation = async (
  orderId: Types.ObjectId | string,
  opts: { requeue?: boolean } = {},
): Promise<CancelRequestOutcome> => {
  const ready = await Order.findOneAndUpdate(
    { _id: orderId, "label.status": ShippingLabelStatus.READY },
    {
      $set: {
        "label.status": ShippingLabelStatus.CANCEL_PENDING,
        "label.cancelAttempts": 0,
        "label.nextAttemptAt": new Date(),
        ...(opts.requeue ? { "label.requeueAfterCancel": true } : {}),
      },
    },
    { new: true },
  );
  if (ready) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.LABEL_CANCEL_REQUESTED,
      module: AuditModule.SHIPPING,
      targetId: String(ready._id),
    });
    track(
      processLabelCancellation(ready._id).catch((err: unknown) =>
        logger.error({ err, orderId: String(ready._id) }, "No se pudo cancelar la guía"),
      ),
    );
    return "cancelling";
  }

  // Nothing bought yet: the pending purchase will simply use the corrected address.
  if (opts.requeue) return "noop";

  const closed = await Order.updateOne(
    {
      _id: orderId,
      "label.status": { $in: [ShippingLabelStatus.PENDING, ShippingLabelStatus.FAILED] },
    },
    {
      $set: {
        "label.status": ShippingLabelStatus.CANCELLED,
        "label.cancelledAt": new Date(),
      },
      $unset: { "label.nextAttemptAt": "" },
    },
  );
  if (closed.modifiedCount > 0) return "closed";

  const current = await Order.findById(orderId).select("label.status").lean();
  if (current?.label?.status === ShippingLabelStatus.REQUESTED) return "in_flight";
  if (current?.label?.status === ShippingLabelStatus.NEEDS_REVIEW) return "needs_review";
  return "noop";
};

const cancelFailureAlert = async (order: {
  _id: Types.ObjectId;
  orderNumber: string;
}): Promise<void> => {
  await enqueueNotification({
    channel: NotificationChannelKind.TEAM,
    type: NotificationType.TEAM_SHIPPING_LABEL_CANCEL_FAILED,
    to: "team",
    order: order._id,
    payload: { orderNumber: order.orderNumber },
  });
};

/** One cancellation attempt for a `cancel_pending` label. Idempotent and safe to race. */
const processLabelCancellation = async (orderId: Types.ObjectId | string): Promise<void> => {
  const now = new Date();
  // The claim pushes nextAttemptAt out by a lease, so a concurrent run skips it.
  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      "label.status": ShippingLabelStatus.CANCEL_PENDING,
      "label.nextAttemptAt": { $lte: now },
    },
    {
      $inc: { "label.cancelAttempts": 1 },
      $set: { "label.nextAttemptAt": new Date(now.getTime() + CANCEL_LEASE_MS) },
    },
    { new: true },
  );
  if (!claimed?.label?.trackingNumber || !claimed.label.carrier) return;

  const attempts = claimed.label.cancelAttempts;
  try {
    await getShippingProvider().cancelLabel(
      { carrier: claimed.label.carrier, trackingNumber: claimed.label.trackingNumber },
      {},
    );
  } catch (err) {
    const kind = err instanceof ShippingProviderError ? err.kind : "rejected";
    const giveUp = kind !== "unavailable" || attempts >= CANCEL_MAX_ATTEMPTS;
    const message = (err instanceof Error ? err.message : "unexpected_error").slice(0, 500);
    if (giveUp) {
      await Order.updateOne(
        { _id: claimed._id, "label.status": ShippingLabelStatus.CANCEL_PENDING },
        { $set: { "label.status": ShippingLabelStatus.NEEDS_REVIEW, "label.lastError": message } },
      );
      await cancelFailureAlert(claimed);
      await recordAudit({
        actorType: "system",
        action: AuditAction.LABEL_NEEDS_REVIEW,
        module: AuditModule.SHIPPING,
        targetId: String(claimed._id),
        after: { reason: message },
      });
    } else {
      await Order.updateOne(
        { _id: claimed._id, "label.status": ShippingLabelStatus.CANCEL_PENDING },
        { $set: { "label.nextAttemptAt": backoffDate(attempts), "label.lastError": message } },
      );
    }
    return;
  }

  if (claimed.label.requeueAfterCancel) {
    // Address corrected: the old guide is void, buy a fresh one for the new address.
    await Order.updateOne(
      { _id: claimed._id, "label.status": ShippingLabelStatus.CANCEL_PENDING },
      {
        $set: {
          "label.status": ShippingLabelStatus.PENDING,
          "label.attempts": 0,
          "label.cancelAttempts": 0,
          "label.nextAttemptAt": new Date(),
        },
        $unset: {
          "label.providerShipmentId": "",
          "label.trackingNumber": "",
          "label.carrier": "",
          "label.labelUrl": "",
          "label.trackUrl": "",
          "label.costMxn": "",
          "label.readyAt": "",
          "label.lastError": "",
          "label.requeueAfterCancel": "",
        },
      },
    );
    await recordAudit({
      actorType: "system",
      action: AuditAction.LABEL_CANCELLED,
      module: AuditModule.SHIPPING,
      targetId: String(claimed._id),
      after: { requeued: true },
    });
    triggerLabelPurchase(claimed._id);
    return;
  }

  await Order.updateOne(
    { _id: claimed._id, "label.status": ShippingLabelStatus.CANCEL_PENDING },
    {
      $set: { "label.status": ShippingLabelStatus.CANCELLED, "label.cancelledAt": new Date() },
      $unset: { "label.nextAttemptAt": "", "label.lastError": "" },
    },
  );
  await recordAudit({
    actorType: "system",
    action: AuditAction.LABEL_CANCELLED,
    module: AuditModule.SHIPPING,
    targetId: String(claimed._id),
  });
};

/** After a purchase lands: if the order died while it was in flight, void the label now. */
const cancelIfOrderDead = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await Order.findById(orderId).select("status disputeStatus").lean();
  if (!order) return;
  if (DEAD_STATUSES.includes(order.status) || order.disputeStatus === DisputeStatus.LOST) {
    await requestLabelCancellation(orderId);
  }
};

export type { PurchaseOutcome, CancelRequestOutcome };
export {
  LABEL_MAX_ATTEMPTS,
  LABEL_LEASE_MS,
  LABELABLE,
  purchaseLabelForOrder,
  triggerLabelPurchase,
  enqueueLabel,
  retryLabel,
  failStaleLease,
  requestLabelCancellation,
  processLabelCancellation,
  settleLabelWork,
};
