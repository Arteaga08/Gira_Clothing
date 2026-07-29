import mongoose, { type Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  NotificationChannelKind,
  NotificationType,
  OrderStatus,
  PaymentStatus,
} from "@gira/shared";
import { Order, type OrderDocument } from "../models/Order.js";
import { commitReservation, releaseReservation } from "./reservationService.js";
import { restockUnits } from "./inventoryService.js";
import { assertTransition } from "../utils/orderTransitions.js";
import { recordAudit } from "./auditService.js";
import { enqueueNotification } from "./notificationService.js";

/**
 * The effects of a payment outcome on an order. Lives apart from
 * webhookService on purpose: the reconciliation job (Tarea 15) applies the
 * EXACT same effects when a webhook never arrives. Two copies of this logic
 * would drift, and the drift would only show up as a stock discrepancy weeks
 * later.
 *
 * Every function here is idempotent — it checks the order's current status
 * and no-ops if the effect already landed. That is what makes a re-delivered
 * Stripe webhook (or a job that runs twice) harmless.
 */

/**
 * Notifications are queued, never sent here. Two reasons this is not a detail:
 * a Resend timeout inside applyPaymentSucceeded would delay committing the
 * stock reservation, and this function runs twice by design (webhook +
 * reconciliation job) — the outbox's unique index is what keeps the customer
 * from getting two confirmations.
 *
 * The payload is a FLAT SNAPSHOT of what the email says, frozen now: the order
 * is immutable, but the template must not re-read anything at delivery time.
 */
const queueOrderPaidNotifications = async (order: OrderDocument): Promise<void> => {
  await enqueueNotification({
    channel: NotificationChannelKind.EMAIL,
    type: NotificationType.ORDER_CONFIRMATION,
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

  // No `order` field: team pings are not subject to the one-per-order index,
  // and the channel id is the recipient, not a person.
  await enqueueNotification({
    channel: NotificationChannelKind.TEAM,
    type: NotificationType.TEAM_ORDER_PAID,
    to: "team",
    payload: {
      publicId: order.publicId,
      total: order.total,
      currency: order.currency,
      itemCount: order.lines.reduce((sum, line) => sum + line.qty, 0),
    },
  });
};

/** Statuses reached only once fulfillment started — the restock boundary. */
const LEFT_THE_WAREHOUSE = new Set<OrderStatus>([
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

/** Terminal statuses that mean the order is dead but the money still arrived. */
const DEAD_ON_ARRIVAL = new Set<OrderStatus>([OrderStatus.EXPIRED, OrderStatus.CANCELLED]);

/**
 * Raises the one alarm a human must act on. The order is NOT moved: what to do
 * with money that landed on a dead order (surtir si queda stock, o reembolsar)
 * is a business call, and guessing it in code would be worse than asking.
 *
 * The audit entry and the alert both carry only the folio and a short internal
 * reason code — no customer data reaches the Telegram group.
 */
const flagForReview = async (
  order: OrderDocument,
  reason: string,
  action: AuditAction,
): Promise<void> => {
  await recordAudit({
    actorType: "system",
    action,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
    after: { reason, status: order.status },
  });
  await enqueueNotification({
    channel: NotificationChannelKind.TEAM,
    type: NotificationType.TEAM_PAYMENT_NEEDS_REVIEW,
    to: "team",
    order: order._id,
    payload: { publicId: order.publicId, reason },
  });
};

const applyPaymentSucceeded = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order) return;
  if (order.status !== OrderStatus.PENDING_PAYMENT) {
    // Already paid/shipped/refunded: genuinely idempotent, nothing to say.
    // Expired or cancelled is NOT the same thing — the charging window was
    // supposed to be closed and the customer was charged anyway. Returning
    // quietly here is how an order used to dead-end with the money taken, no
    // email, no stock movement and no trace.
    if (DEAD_ON_ARRIVAL.has(order.status)) {
      await flagForReview(order, "payment_after_expiry", AuditAction.PAYMENT_AFTER_EXPIRY);
    }
    return;
  }

  assertTransition(order.status, OrderStatus.PAID);
  order.status = OrderStatus.PAID;
  order.paidAt = new Date();
  order.payment.status = PaymentStatus.SUCCEEDED;
  order.statusHistory.push({ status: OrderStatus.PAID, at: new Date() });
  await order.save();

  // Only now do the held units leave the warehouse for good. Idempotent by design.
  // A `false` here means the hold was already released (the expiry sweep won the
  // race): the order is paid but its units went back on sale, so somebody has to
  // look. Discarding this boolean is what made that outcome invisible.
  const committed = await commitReservation(order._id);
  if (!committed) {
    await flagForReview(order, "stock_commit_missed", AuditAction.STOCK_COMMIT_MISSED);
  }

  await queueOrderPaidNotifications(order);

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_SUCCEEDED,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
  });
};

/**
 * Order STAYS pending_payment: Stripe lets the customer retry the same intent
 * with another card, and releasing the hold here would sell the item out from
 * under someone who is one tap away from paying.
 */
const applyPaymentFailed = async (orderId: Types.ObjectId, reason?: string): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order) return;
  if (order.status !== OrderStatus.PENDING_PAYMENT) return;

  order.payment.status = PaymentStatus.FAILED;
  if (reason) order.payment.lastError = reason;
  await order.save();

  // No email here — Stripe's own Payment Element already tells the customer
  // the card was declined. The team gets pinged because a failed payment on a
  // retryable order is exactly the kind of thing that needs a human glance.
  await enqueueNotification({
    channel: NotificationChannelKind.TEAM,
    type: NotificationType.TEAM_PAYMENT_FAILED,
    to: "team",
    payload: { publicId: order.publicId, ...(reason ? { reason } : {}) },
  });

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_FAILED,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
    ...(reason ? { after: { reason } } : {}),
  });
};

const applyPaymentCancelled = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order) return;
  if (order.status !== OrderStatus.PENDING_PAYMENT) return;

  assertTransition(order.status, OrderStatus.CANCELLED);
  order.status = OrderStatus.CANCELLED;
  order.payment.status = PaymentStatus.CANCELLED;
  order.statusHistory.push({
    status: OrderStatus.CANCELLED,
    at: new Date(),
    reason: "payment_cancelled",
  });
  await order.save();

  await releaseReservation(order._id, "payment_cancelled");

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_CANCELLED,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
  });
};

/**
 * Restock ONLY if nothing ever left the workshop. Past that boundary the
 * goods are gone or in transit, and putting them back would invent units that
 * do not exist — the audit entry tells the admin to adjust by hand if the
 * return physically arrives. Checked against the FULL statusHistory, not just
 * the current status: a dispute can detour an order through DISPUTED before
 * landing back here, and the current status alone would lose that context.
 */
const applyRefund = async (orderId: Types.ObjectId): Promise<void> => {
  // The status change and the restock are ONE unit of work. Before, the order
  // was saved first and the lines were reposted afterwards in a bare loop: a
  // throw on line 2 of 3 left the order refunded with the inventory permanently
  // half-corrected, and nothing retried it — webhookService had already claimed
  // the event, so the redelivery was discarded as a duplicate.
  let publicId = "";
  let restocked = false;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Reset per attempt: withTransaction retries its callback on transient errors.
      publicId = "";
      restocked = false;

      const order = await Order.findById(orderId).session(session);
      if (!order || order.status === OrderStatus.REFUNDED) return;

      const everLeftTheWarehouse = order.statusHistory.some((h) =>
        LEFT_THE_WAREHOUSE.has(h.status),
      );
      assertTransition(order.status, OrderStatus.REFUNDED);
      order.status = OrderStatus.REFUNDED;
      order.payment.status = PaymentStatus.REFUNDED;
      order.statusHistory.push({ status: OrderStatus.REFUNDED, at: new Date() });
      await order.save({ session });

      if (!everLeftTheWarehouse) {
        await restockUnits(order.lines, session);
        restocked = true;
      }
      publicId = order.publicId;
    });
  } finally {
    await session.endSession();
  }

  // Nothing moved (already refunded, or the order is gone) -> nothing to audit.
  if (!publicId) return;

  // Audited only after the transaction committed: an entry for a write that was
  // rolled back is worse than no entry at all.
  if (restocked) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.STOCK_RESTOCKED_ON_REFUND,
      module: AuditModule.INVENTORY,
      targetId: publicId,
    });
  }

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_REFUNDED,
    module: AuditModule.PAYMENTS,
    targetId: publicId,
  });
};

const applyDisputeOpened = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order || order.status === OrderStatus.DISPUTED) return;

  assertTransition(order.status, OrderStatus.DISPUTED);
  order.status = OrderStatus.DISPUTED;
  order.statusHistory.push({ status: OrderStatus.DISPUTED, at: new Date() });
  await order.save();

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_DISPUTED,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
  });
};

/** A dispute closed in the merchant's favour returns the order to paid; a loss is a refund. */
const applyDisputeClosed = async (orderId: Types.ObjectId, won: boolean): Promise<void> => {
  if (!won) {
    await applyRefund(orderId);
    return;
  }

  const order = await Order.findById(orderId);
  if (!order || order.status !== OrderStatus.DISPUTED) return;

  assertTransition(order.status, OrderStatus.PAID);
  order.status = OrderStatus.PAID;
  order.statusHistory.push({ status: OrderStatus.PAID, at: new Date(), reason: "dispute_won" });
  await order.save();

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_SUCCEEDED,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
  });
};

export {
  applyPaymentSucceeded,
  applyPaymentFailed,
  applyPaymentCancelled,
  applyRefund,
  applyDisputeOpened,
  applyDisputeClosed,
};
