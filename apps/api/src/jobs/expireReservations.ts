import { AuditAction, AuditModule, OrderStatus, ReservationStatus } from "@gira/shared";
import { StockReservation } from "../models/StockReservation.js";
import { Order } from "../models/Order.js";
import { releaseReservation } from "../services/reservationService.js";
import { recordAudit } from "../services/auditService.js";
import { logger } from "../config/logger.js";

/**
 * Releases holds whose window closed. This is the REAL expiry mechanism — the
 * TTL index on StockReservation.purgeAt only garbage-collects reservations that
 * already reached a terminal state, because a TTL index deletes documents and
 * cannot decrement Variant.reserved.
 *
 * Exported as a plain async function so tests drive it directly; the scheduler
 * is the only thing that puts it on a timer.
 */
const BATCH = 200;

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
      // stock is the point; the status update is best-effort on top of that.
      const expired = await Order.findOneAndUpdate(
        { _id: reservation.order, status: OrderStatus.PENDING_PAYMENT },
        {
          $set: { status: OrderStatus.EXPIRED },
          $push: {
            statusHistory: {
              status: OrderStatus.EXPIRED,
              at: new Date(),
              reason: "reservation_expired",
            },
          },
        },
      );
      if (expired) {
        await recordAudit({
          actorType: "system",
          action: AuditAction.ORDER_EXPIRED,
          module: AuditModule.ORDERS,
          targetId: expired.publicId,
        });
      }
    } catch (err) {
      // One bad reservation must not stop the sweep.
      logger.error({ err, order: reservation.order }, "No se pudo expirar la reserva");
    }
  }
  return { released };
};

export { expireReservations };
