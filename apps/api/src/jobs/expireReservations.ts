import { AuditAction, AuditModule, OrderStatus, ReservationStatus } from "@gira/shared";
import { StockReservation } from "../models/StockReservation.js";
import { Order, type OrderDocument } from "../models/Order.js";
import { releaseReservation } from "../services/reservationService.js";
import { recordAudit } from "../services/auditService.js";
import { flagForReview } from "../services/paymentAlertService.js";
import { getPaymentProvider } from "../adapters/payment/index.js";
import { applyOrderTransition } from "../services/orderTransitionService.js";
import { logger } from "../config/logger.js";

/**
 * Releases holds whose window closed. This is the REAL expiry mechanism — the
 * TTL index on StockReservation.purgeAt only garbage-collects reservations that
 * already reached a terminal state, because a TTL index deletes documents and
 * cannot decrement Variant.reserved.
 *
 * Expiring an order does THREE things, and the third is not optional: the
 * PaymentIntent is cancelled at the provider. The window to charge is exactly
 * the window the stock was held for — past it the units are back on sale and
 * the price may have moved, so a customer must not be able to confirm that
 * intent an hour later and pay for something we can no longer honour.
 *
 * Exported as a plain async function so tests drive it directly; the scheduler
 * is the only thing that puts it on a timer.
 */
const BATCH = 200;

/**
 * Closes the charging window. Best-effort by contract: the stock is already
 * back and the order already expired, so a provider outage must not undo any of
 * that — it only leaves an audit entry saying the intent is still live.
 */
const cancelPendingCharge = async (order: OrderDocument, intentId: string): Promise<void> => {
  try {
    await getPaymentProvider().cancelPayment(intentId);
  } catch (err) {
    logger.error(
      { err, order: order.publicId },
      "No se pudo cancelar el intent de una orden expirada",
    );
    // The intent is still live: the customer can pay an order whose stock is back
    // on sale. Audit + team alert. The alert deliberately skips the order's single
    // `needs_review` slot — if that payment then lands, `payment_after_expiry` is
    // the more serious alarm and must not be swallowed as a duplicate. The expire
    // transition runs once per order, so this one cannot repeat.
    await flagForReview(order, "payment_cancel_failed", AuditAction.PAYMENT_CANCEL_FAILED, {
      dedupePerOrder: false,
    });
  }
};

/** Statuses where the order is already dead, so an active hold is leftover and safe to release. */
const DEAD_STATUSES = new Set<OrderStatus>([OrderStatus.CANCELLED, OrderStatus.EXPIRED]);

/** Audit + close the charging window, after the order is already expired. */
const expireAftermath = async (order: OrderDocument): Promise<void> => {
  await recordAudit({
    actorType: "system",
    action: AuditAction.ORDER_EXPIRED,
    module: AuditModule.ORDERS,
    targetId: order.publicId,
  });
  if (order.payment.intentId) {
    await cancelPendingCharge(order, order.payment.intentId);
  }
};

const expireReservations = async (): Promise<{ released: number }> => {
  const due = await StockReservation.find({
    status: ReservationStatus.ACTIVE,
    expiresAt: { $lt: new Date() },
  })
    .select("order")
    .limit(BATCH)
    .lean();

  let released = 0;
  for (const reservation of due) {
    try {
      const order = await Order.findById(reservation.order);

      // The order is expired BEFORE its stock is released. Releasing first left
      // two holes: a webhook paying in between found its hold gone (paid order,
      // units back on sale), and a failure after the release left the order
      // pending with nothing for this sweep to revisit.
      if (order && order.status === OrderStatus.PENDING_PAYMENT) {
        // Atomic on `pending_payment`: if the webhook paid the order since the
        // read above this matches nothing, the paid order is left alone, and
        // its commitReservation keeps ownership of the hold.
        const expired = await applyOrderTransition({
          orderId: order._id,
          from: OrderStatus.PENDING_PAYMENT,
          to: OrderStatus.EXPIRED,
          actor: { type: "system" },
          reason: "reservation_expired",
        });
        if (!expired) continue;
        // Aftermath first: it closes the charging window and never throws. If
        // the release below throws, the next sweep finds a dead order with an
        // active hold and releases it — the intent is already cancelled by then.
        await expireAftermath(expired);
        if (await releaseReservation(reservation.order, "expired")) released += 1;
        continue;
      }

      // No order (crash between reserve and create) or one already dead: the
      // stock is the point. A paid/shipped order never has its hold stolen.
      if (!order || DEAD_STATUSES.has(order.status)) {
        if (await releaseReservation(reservation.order, "expired")) released += 1;
      }
    } catch (err) {
      // One bad reservation must not stop the sweep.
      logger.error({ err, order: reservation.order }, "No se pudo expirar la reserva");
    }
  }
  return { released };
};

export { expireReservations };
