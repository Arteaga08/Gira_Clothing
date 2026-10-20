import mongoose, { type Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  DisputeStatus,
  NotificationChannelKind,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
} from "@gira/shared";
import { Order, type OrderDocument } from "../models/Order.js";
import { StockReservation } from "../models/StockReservation.js";
import { commitReservation, releaseReservation } from "./reservationService.js";
import { restockUnits } from "./inventoryService.js";
import { applyOrderTransition } from "./orderTransitionService.js";
import { recordAudit } from "./auditService.js";
import { enqueueNotification } from "./notificationService.js";
import { flagForReview } from "./paymentAlertService.js";
import { clearCart } from "./cartService.js";
import { enqueueLabel, requestLabelCancellation } from "./shippingLabelService.js";
import { AppError } from "../utils/AppError.js";
import { toOrderEmailSnapshot } from "../utils/orderEmailSnapshot.js";
import { logger } from "../config/logger.js";
import { getPaymentProvider, type ChargeDetails } from "../adapters/payment/index.js";

/**
 * The effects of a payment outcome on an order. Lives apart from
 * webhookService on purpose: the reconciliation job (Tarea 15) applies the
 * EXACT same effects when a webhook never arrives. Two copies of this logic
 * would drift, and the drift would only show up as a stock discrepancy weeks
 * later.
 *
 * Every function here is idempotent AND re-runnable: it derives what is left to
 * do from the order's persisted state, not from "did I just make the
 * transition". That is what lets a webhook whose effect threw halfway be
 * retried to completion, and a re-delivered one be harmless.
 */

/**
 * Notifications are queued, never sent here. Two reasons this is not a detail:
 * a Resend timeout inside applyPaymentSucceeded would delay committing the
 * stock reservation, and this function runs more than once by design (webhook
 * retries + reconciliation job) — the outbox's unique index on (order, type) is
 * what keeps the customer, and the team, from getting two of each.
 *
 * Queued STRICTLY: a lost enqueue must fail the webhook so the provider retries,
 * instead of leaving a paid order that nobody was told about.
 *
 * The payload is a FLAT SNAPSHOT of what the email says, frozen now: the order
 * is immutable, but the template must not re-read anything at delivery time.
 */
const queueOrderPaidNotifications = async (order: OrderDocument): Promise<void> => {
  await enqueueNotification(
    {
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: order.customer.email,
      order: order._id,
      payload: toOrderEmailSnapshot(order) as unknown as Record<string, unknown>,
    },
    { strict: true },
  );

  // Carries `order` so the same index dedupes it across retries; the channel id
  // is the recipient, not a person.
  await enqueueNotification(
    {
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_ORDER_PAID,
      to: "team",
      order: order._id,
      payload: {
        orderNumber: order.orderNumber,
        total: order.total,
        currency: order.currency,
        itemCount: order.lines.reduce((sum, line) => sum + line.qty, 0),
      },
    },
    { strict: true },
  );
};

/** Statuses where the sale is paid and alive: the effects of paying apply here. */
const PAID_AND_ALIVE = new Set<OrderStatus>([
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

/** Statuses reached only once fulfillment started — the restock boundary (legacy fallback). */
const LEFT_THE_WAREHOUSE = new Set<OrderStatus>([
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

/** Terminal statuses that mean the order is dead but the money still arrived. */
const DEAD_ON_ARRIVAL = new Set<OrderStatus>([OrderStatus.EXPIRED, OrderStatus.CANCELLED]);

const SYSTEM = { type: "system" } as const;

/**
 * Money landed on an order that is already expired/cancelled. The order is NOT
 * moved: what to do with it (surtir si queda stock, o reembolsar) is a business
 * call. But the order must SAY the money arrived — payment.status/paidAt — or
 * the panel shows a dead order with no trace of the charge.
 */
const handleDeadOnArrival = async (order: OrderDocument): Promise<void> => {
  await Order.updateOne(
    {
      _id: order._id,
      status: { $in: [...DEAD_ON_ARRIVAL] },
      "payment.status": { $nin: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
    },
    { $set: { "payment.status": PaymentStatus.SUCCEEDED, paidAt: new Date() } },
  );
  await flagForReview(order, "payment_after_expiry", AuditAction.PAYMENT_AFTER_EXPIRY, {
    strict: true,
  });
};

/** True when the units really left stock: the order says so, or its reservation still does. */
const stockWasCommitted = (
  order: { stockCommittedAt?: Date | undefined },
  reservationStatus: ReservationStatus | undefined,
): boolean => Boolean(order.stockCommittedAt) || reservationStatus === ReservationStatus.COMMITTED;

/** True when fulfillment began: the flag, or (orders from before the flag) the status/history. */
const fulfillmentStarted = (order: {
  status: OrderStatus;
  fulfillmentStartedAt?: Date | undefined;
  statusHistory: readonly { status: OrderStatus }[];
}): boolean =>
  Boolean(order.fulfillmentStartedAt) ||
  LEFT_THE_WAREHOUSE.has(order.status) ||
  order.statusHistory.some((h) => LEFT_THE_WAREHOUSE.has(h.status));

/**
 * Everything that must follow a payment, derived from persisted state so a
 * retry after a crash finishes the job: commit the held units, queue the
 * notifications, empty the cart the order was built from. Each step is
 * idempotent on its own, and `paidEffectsAt` is stamped only when all of them
 * ran, so the reconciliation job can find an order that stopped halfway.
 */
const runPaidEffects = async (order: OrderDocument): Promise<void> => {
  let committed: boolean;
  try {
    committed = await commitReservation(order._id);
  } catch (err) {
    // Money taken, stock not decremented, and the order already says `paid`: the
    // retry re-enters here, but a human should know NOW that it is stuck.
    await flagForReview(order, "stock_commit_failed", AuditAction.STOCK_COMMIT_FAILED).catch(
      (flagErr: unknown) =>
        logger.error({ err: flagErr }, "No se pudo alertar stock_commit_failed"),
    );
    throw err;
  }

  if (!committed) {
    // `false` is either "an earlier attempt already committed it" (a retry — say
    // nothing) or "the hold was released before payment arrived" (units back on
    // sale, order paid — somebody has to look). Persisted state tells them apart.
    const [fresh, reservation] = await Promise.all([
      Order.findById(order._id).select("stockCommittedAt").lean(),
      StockReservation.findOne({ order: order._id }).select("status").lean(),
    ]);
    if (!stockWasCommitted(fresh ?? {}, reservation?.status)) {
      await flagForReview(order, "stock_commit_missed", AuditAction.STOCK_COMMIT_MISSED, {
        strict: true,
      });
    }
  }

  await queueOrderPaidNotifications(order);

  // The cart is emptied when the order is PAID, not when it is created: an
  // abandoned or failed checkout must not cost the customer their cart. Emptied
  // fully (the order lists everything that was in it) and only once — the stamp
  // below stops a redelivery from wiping what they added afterwards.
  if (order.fromCart && order.user && !order.paidEffectsAt) await clearCart(order.user);

  // The label is part of "payment effects" so the reconciler retries it if we die
  // here; the purchase itself runs in the background and has its own retries.
  await enqueueLabel(order._id);

  await Order.updateOne(
    { _id: order._id, paidEffectsAt: { $exists: false } },
    { $set: { paidEffectsAt: new Date() } },
  );
};

/**
 * Card label + capture time are display data: a provider hiccup reading them must
 * never keep a paid order from being marked paid, so failure degrades to "unknown".
 */
const readChargeDetails = async (intentId: string | undefined): Promise<ChargeDetails> => {
  if (!intentId) return {};
  try {
    return await getPaymentProvider().getChargeDetails(intentId);
  } catch (err) {
    logger.warn({ err }, "No se pudo leer el cargo; la orden se marca pagada sin tarjeta");
    return {};
  }
};

/**
 * Writes capturedAt + card once, with a targeted update (never a whole-document
 * save). Guarded by `capturedAt` absent so webhook retries and the reconciler
 * fill what a failed first attempt missed, and never overwrite it.
 */
const stampChargeDetails = async (order: OrderDocument): Promise<void> => {
  if (order.payment.capturedAt) return;
  const details = await readChargeDetails(order.payment.intentId);
  await Order.updateOne(
    { _id: order._id, "payment.capturedAt": { $exists: false } },
    {
      $set: {
        "payment.capturedAt": details.capturedAt ?? order.paidAt ?? new Date(),
        ...(details.card ? { "payment.card": details.card } : {}),
      },
    },
  );
};

const applyPaymentSucceeded = async (orderId: Types.ObjectId): Promise<void> => {
  const current = await Order.findById(orderId);
  if (!current) return;

  if (DEAD_ON_ARRIVAL.has(current.status)) {
    // The charging window was supposed to be closed and the customer was charged
    // anyway. Returning quietly here is how an order used to dead-end with the
    // money taken, no email, no stock movement and no trace.
    await handleDeadOnArrival(current);
    return;
  }

  if (current.status === OrderStatus.PENDING_PAYMENT) {
    // Atomic against the expiry sweep: the filter pins `pending_payment`, so if
    // the sweep got there first this returns null instead of overwriting it.
    const paid = await applyOrderTransition({
      orderId,
      from: OrderStatus.PENDING_PAYMENT,
      to: OrderStatus.PAID,
      actor: SYSTEM,
      set: { paidAt: new Date(), "payment.status": PaymentStatus.SUCCEEDED },
    });
    if (paid) {
      // After the status is committed: a slow provider must never delay "paid".
      await stampChargeDetails(paid);
      await recordAudit({
        actorType: "system",
        action: AuditAction.PAYMENT_SUCCEEDED,
        module: AuditModule.PAYMENTS,
        targetId: String(paid._id),
      });
      await runPaidEffects(paid);
      return;
    }
    // Lost the race: re-read and fall through to whatever the order became.
    const latest = await Order.findById(orderId);
    if (!latest) return;
    if (DEAD_ON_ARRIVAL.has(latest.status)) await handleDeadOnArrival(latest);
    else if (PAID_AND_ALIVE.has(latest.status)) {
      await stampChargeDetails(latest);
      await runPaidEffects(latest);
    }
    return;
  }

  // Already paid (a webhook retry whose effects threw, or a duplicate): finish
  // whatever is left. Refunded: nothing to do.
  if (PAID_AND_ALIVE.has(current.status)) {
    await stampChargeDetails(current);
    await runPaidEffects(current);
  }
};

/**
 * Order STAYS pending_payment: Stripe lets the customer retry the same intent
 * with another card, and releasing the hold here would sell the item out from
 * under someone who is one tap away from paying.
 *
 * Pinned to `pending_payment` IN THE FILTER: a read-then-save here used to
 * overwrite `payment.status` of an order the webhook had just marked paid.
 */
const applyPaymentFailed = async (orderId: Types.ObjectId, reason?: string): Promise<void> => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: OrderStatus.PENDING_PAYMENT },
    {
      $set: {
        "payment.status": PaymentStatus.FAILED,
        ...(reason ? { "payment.lastError": reason } : {}),
      },
    },
    { new: true },
  );
  if (!order) return;

  // No email here — Stripe's own Payment Element already tells the customer
  // the card was declined. The team gets pinged because a failed payment on a
  // retryable order is exactly the kind of thing that needs a human glance.
  await enqueueNotification(
    {
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_PAYMENT_FAILED,
      to: "team",
      payload: { orderNumber: order.orderNumber, ...(reason ? { reason } : {}) },
    },
    { strict: true },
  );

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_FAILED,
    module: AuditModule.PAYMENTS,
    targetId: String(order._id),
    ...(reason ? { after: { reason } } : {}),
  });
};

const applyPaymentCancelled = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await applyOrderTransition({
    orderId,
    from: OrderStatus.PENDING_PAYMENT,
    to: OrderStatus.CANCELLED,
    actor: SYSTEM,
    reason: "payment_cancelled",
    set: { "payment.status": PaymentStatus.CANCELLED, cancelReason: "payment_cancelled" },
  });
  if (!order) return; // not pending anymore (or gone): nothing to cancel

  await releaseReservation(order._id, "payment_cancelled");

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_CANCELLED,
    module: AuditModule.PAYMENTS,
    targetId: String(order._id),
  });
};

/**
 * `charge.refunded` reports the CUMULATIVE amount returned, so a partial and a
 * total refund are told apart by comparing it with the order total:
 *
 *  - partial: record the amount and audit it; status and stock stay put (the
 *    customer kept part of the goods or the money simply came back in pieces).
 *  - total on a paid order: the order becomes `refunded`, and units go back to
 *    stock ONLY if they really left it (reservation committed) and nothing was
 *    handed to the workshop yet. Past that boundary the goods are gone or in
 *    transit, and putting them back would invent units that do not exist.
 *  - total on an expired/cancelled order (the late payment a human decided to
 *    return): only the payment is marked refunded. The order stays dead and no
 *    stock moves — the reservation was already released.
 *
 * The recorded amount is OVERWRITTEN from the provider (never summed) and only
 * ever grows, so a re-delivered or out-of-order event cannot double-count.
 */
const applyRefund = async (orderId: Types.ObjectId, amountRefunded?: number): Promise<void> => {
  if (amountRefunded === undefined || !Number.isInteger(amountRefunded) || amountRefunded <= 0) {
    // Deterministic: redelivering the same payload cannot fix it.
    throw new AppError("El reembolso no trae un monto devuelto válido.", 422);
  }

  const grew = await Order.findOneAndUpdate(
    {
      _id: orderId,
      $or: [
        { "payment.refundedAmount": { $exists: false } },
        { "payment.refundedAmount": { $lt: amountRefunded } },
      ],
    },
    { $set: { "payment.refundedAmount": amountRefunded, "payment.refundedAt": new Date() } },
    { new: true },
  );
  const order = grew ?? (await Order.findById(orderId));
  if (!order) return;

  if (amountRefunded < order.total) {
    if (grew) {
      await recordAudit({
        actorType: "system",
        action: AuditAction.PAYMENT_PARTIALLY_REFUNDED,
        module: AuditModule.PAYMENTS,
        targetId: String(order._id),
        after: { amountRefunded },
      });
    }
    return;
  }

  if (DEAD_ON_ARRIVAL.has(order.status)) {
    const marked = await Order.updateOne(
      {
        _id: orderId,
        status: { $in: [...DEAD_ON_ARRIVAL] },
        "payment.status": { $ne: PaymentStatus.REFUNDED },
      },
      { $set: { "payment.status": PaymentStatus.REFUNDED } },
    );
    if (marked.modifiedCount > 0) {
      await recordAudit({
        actorType: "system",
        action: AuditAction.PAYMENT_REFUNDED,
        module: AuditModule.PAYMENTS,
        targetId: String(order._id),
        after: { status: order.status },
      });
    }
    return;
  }

  if (order.status === OrderStatus.PENDING_PAYMENT) {
    // The refund overtook the payment event (it is being retried, or events
    // arrived out of order). Swallowing it would let the payment land later and
    // commit stock for money that already went back. A plain Error (not 4xx) fails
    // the webhook so the provider redelivers once the order has caught up.
    throw new Error("refund_before_payment_applied");
  }

  if (order.status === OrderStatus.REFUNDED) {
    // A previous attempt moved the order but may have died before settling the
    // hold: closing it is idempotent, so a retry always finishes the job.
    await releaseReservation(orderId, "refunded");
    return;
  }

  await refundPaidOrder(orderId);
};

/** Total refund of a paid order: the status change and the restock are ONE unit of work. */
const refundPaidOrder = async (orderId: Types.ObjectId): Promise<void> => {
  // Before, the order was saved first and the lines were reposted afterwards in
  // a bare loop: a throw on line 2 of 3 left the order refunded with the
  // inventory permanently half-corrected.
  let orderNumber = "";
  let restocked = false;
  let reservationWasActive = false;
  let unaccountedStock = false;
  let beforePickup = false;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Reset per attempt: withTransaction retries its callback on transient errors.
      orderNumber = "";
      restocked = false;
      reservationWasActive = false;
      unaccountedStock = false;
      beforePickup = false;

      const before = await Order.findById(orderId).session(session);
      if (!before || before.status === OrderStatus.REFUNDED) return;
      // Expired/cancelled/pending mid-flight: abort so the redelivery re-evaluates.
      if (!PAID_AND_ALIVE.has(before.status)) throw new Error("order_status_changed_during_refund");

      const reservation = await StockReservation.findOne({ order: orderId }).session(session);
      const committed = stockWasCommitted(before, reservation?.status);
      const started = fulfillmentStarted(before);
      beforePickup = before.status === OrderStatus.PAID || before.status === OrderStatus.PROCESSING;

      const order = await applyOrderTransition({
        orderId,
        from: before.status,
        to: OrderStatus.REFUNDED,
        actor: SYSTEM,
        set: { "payment.status": PaymentStatus.REFUNDED },
        session,
      });
      // Moved by someone else between the read and the write: abort this
      // attempt; the redelivered webhook re-evaluates from the new state.
      if (!order) throw new Error("order_status_changed_during_refund");

      if (committed && !started) {
        // The reservation is the record of what was ACTUALLY taken out; the
        // order lines are the fallback once it has been purged.
        await restockUnits(reservation?.lines ?? order.lines, session);
        restocked = true;
      }
      reservationWasActive = reservation?.status === ReservationStatus.ACTIVE;
      unaccountedStock = !committed && !reservationWasActive;
      orderNumber = order.orderNumber;
    });
  } finally {
    await session.endSession();
  }

  // Nothing moved (the order is gone or was no longer paid) -> nothing to audit.
  if (!orderNumber) return;

  // The commit never happened (webhook retry pending) but the money is already
  // back: the hold must not stay `reserved` forever.
  if (reservationWasActive) await releaseReservation(orderId, "refunded");

  // Audited only after the transaction committed: an entry for a write that was
  // rolled back is worse than no entry at all.
  if (restocked) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.STOCK_RESTOCKED_ON_REFUND,
      module: AuditModule.INVENTORY,
      targetId: String(orderId),
    });
  }

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_REFUNDED,
    module: AuditModule.PAYMENTS,
    targetId: String(orderId),
  });

  // The parcel never left: void its label so the balance comes back. Best-effort:
  // a failure here must not undo a refund that already happened.
  if (beforePickup) {
    await requestLabelCancellation(orderId).catch((err: unknown) =>
      logger.error(
        { err, orderId: String(orderId) },
        "No se pudo iniciar la cancelación de la guía",
      ),
    );
  }

  if (unaccountedStock) {
    // Refunded money, but the stock was never taken out (hold released before
    // payment): nothing to put back, and somebody should confirm the books.
    await flagForReview(
      { _id: orderId, orderNumber, status: OrderStatus.REFUNDED },
      "refund_without_committed_stock",
      AuditAction.REFUND_WITHOUT_RESTOCK,
      // Fires once per refund transition; it must not share (or lose to) the
      // order's single needs_review slot taken by an earlier commit alert.
      { dedupePerOrder: false },
    );
  }
};

/**
 * Disputes are fields of the order, not a status: a chargeback does not move the
 * sale through fulfillment, it can arrive on an order in ANY state, and a lost
 * one is NOT a refund (the money left, the order was not reimbursed — and the
 * goods are gone, so nothing goes back to stock). `warning_closed` reaches here
 * as `withdrawn`, which is not a loss either.
 */
const applyDisputeOpened = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, disputeStatus: { $exists: false } },
    { $set: { disputeStatus: DisputeStatus.OPEN, disputedAt: new Date() } },
    { new: true },
  );
  if (!order) return; // already tracked (re-delivery, or `closed` arrived first)

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_DISPUTED,
    module: AuditModule.PAYMENTS,
    targetId: String(order._id),
  });
};

const CLOSED_DISPUTE = [DisputeStatus.WON, DisputeStatus.LOST, DisputeStatus.WITHDRAWN];

const applyDisputeClosed = async (
  orderId: Types.ObjectId,
  outcome?: DisputeStatus,
): Promise<void> => {
  if (!outcome || outcome === DisputeStatus.OPEN) {
    throw new AppError("La disputa cerrada no trae un resultado válido.", 422);
  }

  // `$nin` also matches an order that never saw the `created` event, so a
  // `closed` that arrives first is still recorded.
  const closed = await Order.findOneAndUpdate(
    { _id: orderId, disputeStatus: { $nin: CLOSED_DISPUTE } },
    { $set: { disputeStatus: outcome }, $min: { disputedAt: new Date() } },
    { new: true },
  );
  if (closed) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.PAYMENT_DISPUTE_CLOSED,
      module: AuditModule.PAYMENTS,
      targetId: String(closed._id),
      after: { disputeStatus: outcome },
    });
  }

  // Decided from the PERSISTED outcome, not from "did I write it": if the first
  // attempt recorded the loss and then died before queueing the alert, the retry
  // still raises it. The (order, type) index keeps it to one.
  const order = closed ?? (await Order.findById(orderId));
  if (order?.disputeStatus === DisputeStatus.LOST) {
    await enqueueNotification(
      {
        channel: NotificationChannelKind.TEAM,
        type: NotificationType.TEAM_DISPUTE_LOST,
        to: "team",
        order: order._id,
        payload: { orderNumber: order.orderNumber },
      },
      { strict: true },
    );
    // The goods are still here, the money is gone: void the label if it has not left.
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.PROCESSING) {
      await requestLabelCancellation(order._id).catch((err: unknown) =>
        logger.error(
          { err, orderId: String(order._id) },
          "No se pudo iniciar la cancelación de la guía",
        ),
      );
    }
  }
};

export {
  PAID_AND_ALIVE,
  applyPaymentSucceeded,
  applyPaymentFailed,
  applyPaymentCancelled,
  applyRefund,
  applyDisputeOpened,
  applyDisputeClosed,
};
