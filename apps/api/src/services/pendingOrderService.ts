import { OrderStatus, PaymentStatus } from "@gira/shared";
import type { Types } from "mongoose";
import { Order, type OrderDocument } from "../models/Order.js";
import { AppError } from "../utils/AppError.js";
import { applyOrderTransition } from "./orderTransitionService.js";
import { releaseReservation } from "./reservationService.js";
import { getPaymentProvider } from "../adapters/payment/index.js";
import { logger } from "../config/logger.js";

interface CancelPendingInput {
  actorId: Types.ObjectId | string | undefined;
  /** Status-history reason and reservation release reason (e.g. "admin_cancelled"). */
  reason: string;
  /** Free text frozen on the order, if any. */
  cancelReason?: string;
  /** 409 message when the provider says the customer already paid. */
  paidMessage: string;
}

/**
 * Cancelling a pending order closes the charging window FIRST. The intent is
 * cancelled before the order moves: if the provider refuses, the order is
 * untouched and the caller sees why, instead of a "cancelled" order a customer
 * can still pay. A refusal because the customer just paid is a 409, not a 502 —
 * the order is theirs now. Shared by the panel and by the customer's own cancel.
 */
const cancelPendingOrder = async (
  order: OrderDocument,
  input: CancelPendingInput,
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
        throw new AppError(input.paidMessage, 409);
      }
      // Already cancelled (an earlier attempt got this far, or the other side
      // did): the window is closed, so the order can follow.
      if (live !== PaymentStatus.CANCELLED) throw err;
    }
  }

  const moved = await applyOrderTransition({
    orderId: order._id,
    from: OrderStatus.PENDING_PAYMENT,
    to: OrderStatus.CANCELLED,
    actor: { type: "user", id: input.actorId },
    reason: input.reason,
    set: {
      "payment.status": PaymentStatus.CANCELLED,
      ...(input.cancelReason ? { cancelReason: input.cancelReason } : {}),
    },
  });
  // `payment_intent.canceled` can reach the webhook before this line: the order
  // is then already cancelled, and the caller's intent was honoured all the same.
  const settled = moved ?? (await Order.findOne({ _id: order._id, status: OrderStatus.CANCELLED }));
  if (!settled) return null;

  // The expiry sweep releases any hold left on a cancelled order, so a failure
  // here is recoverable and must not turn a cancelled order into an error page.
  await releaseReservation(order._id, input.reason).catch((err: unknown) => {
    logger.error(
      { err, orderId: String(order._id) },
      "No se pudo liberar la reserva de una orden cancelada",
    );
  });
  return settled;
};

export type { CancelPendingInput };
export { cancelPendingOrder };
