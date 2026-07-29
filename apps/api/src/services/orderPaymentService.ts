import type { Types } from "mongoose";
import { AuditAction, AuditModule, OrderStatus, PaymentStatus } from "@gira/shared";
import { Order } from "../models/Order.js";
import { commitReservation, releaseReservation } from "./reservationService.js";
import { adjustOnHand } from "./inventoryService.js";
import { assertTransition } from "../utils/orderTransitions.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

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

const SYSTEM_CTX: RequestContext = {};

/** Statuses reached only once fulfillment started — the restock boundary. */
const LEFT_THE_WAREHOUSE = new Set<OrderStatus>([
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

const applyPaymentSucceeded = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order) return;
  if (order.status !== OrderStatus.PENDING_PAYMENT) return; // already settled — idempotent

  assertTransition(order.status, OrderStatus.PAID);
  order.status = OrderStatus.PAID;
  order.paidAt = new Date();
  order.payment.status = PaymentStatus.SUCCEEDED;
  order.statusHistory.push({ status: OrderStatus.PAID, at: new Date() });
  await order.save();

  // Only now do the held units leave the warehouse for good. Idempotent by design.
  await commitReservation(order._id);

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
  const order = await Order.findById(orderId);
  if (!order || order.status === OrderStatus.REFUNDED) return;

  const everLeftTheWarehouse = order.statusHistory.some((h) => LEFT_THE_WAREHOUSE.has(h.status));
  assertTransition(order.status, OrderStatus.REFUNDED);
  order.status = OrderStatus.REFUNDED;
  order.payment.status = PaymentStatus.REFUNDED;
  order.statusHistory.push({ status: OrderStatus.REFUNDED, at: new Date() });
  await order.save();

  if (!everLeftTheWarehouse) {
    for (const line of order.lines) {
      await adjustOnHand(String(line.variant), line.qty, SYSTEM_CTX);
    }
    await recordAudit({
      actorType: "system",
      action: AuditAction.STOCK_RESTOCKED_ON_REFUND,
      module: AuditModule.INVENTORY,
      targetId: order.publicId,
    });
  }

  await recordAudit({
    actorType: "system",
    action: AuditAction.PAYMENT_REFUNDED,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
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
