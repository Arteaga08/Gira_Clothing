import { AuditAction, AuditModule, OrderStatus, ReservationStatus } from "@gira/shared";
import { StockReservation } from "../models/StockReservation.js";
import { Order } from "../models/Order.js";
import { releaseReservation } from "../services/reservationService.js";
import { recordAudit } from "../services/auditService.js";
import { getPaymentProvider } from "../adapters/payment/index.js";
import { assertTransition } from "../utils/orderTransitions.js";
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
const cancelPendingCharge = async (intentId: string, publicId: string): Promise<void> => {
  try {
    await getPaymentProvider().cancelPayment(intentId);
  } catch (err) {
    logger.error({ err, order: publicId }, "No se pudo cancelar el intent de una orden expirada");
    await recordAudit({
      actorType: "system",
      action: AuditAction.PAYMENT_CANCEL_FAILED,
      module: AuditModule.PAYMENTS,
      targetId: publicId,
    });
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
      const applied = await releaseReservation(reservation.order, "expired");
      if (applied) released += 1;

      // The order may not exist (crash between reserve and create) — releasing
      // the stock is the point; everything below is best-effort on top of that.
      const order = await Order.findById(reservation.order);
      if (!order || order.status !== OrderStatus.PENDING_PAYMENT) continue;

      // The same single gate every other status change goes through. The guard
      // above already replicates the rule, but the rule lives in ONE file and
      // this must not become a second copy of it.
      assertTransition(order.status, OrderStatus.EXPIRED);
      order.status = OrderStatus.EXPIRED;
      order.statusHistory.push({
        status: OrderStatus.EXPIRED,
        at: new Date(),
        reason: "reservation_expired",
      });
      await order.save();

      await recordAudit({
        actorType: "system",
        action: AuditAction.ORDER_EXPIRED,
        module: AuditModule.ORDERS,
        targetId: order.publicId,
      });

      if (order.payment.intentId) {
        await cancelPendingCharge(order.payment.intentId, order.publicId);
      }
    } catch (err) {
      // One bad reservation must not stop the sweep.
      logger.error({ err, order: reservation.order }, "No se pudo expirar la reserva");
    }
  }
  return { released };
};

export { expireReservations };
