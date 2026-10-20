import type { ClientSession, Types } from "mongoose";
import { MAX_STATUS_HISTORY, OrderStatus } from "@gira/shared";
import { Order, type OrderDocument } from "../models/Order.js";
import { assertTransition } from "../utils/orderTransitions.js";

/**
 * The ONLY place that writes `Order.status`. A direct `order.status = x; save()`
 * is read-modify-write: two actors that both read `pending_payment` (the
 * webhook paying, the sweep expiring) both pass `assertTransition` and the
 * later save silently wins. Here the expected current status is part of the
 * filter, so Mongo serializes them: exactly one matches.
 *
 * Returns the updated order, or `null` when the order is no longer in `from`
 * (someone else moved it first, or it does not exist). Callers treat `null`
 * as "already handled" and must NOT run the transition's side effects.
 * An illegal pair throws 409 before any write.
 */

/** Statuses that mean fulfillment began: past this point a refund must not restock. */
const FULFILLMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

interface TransitionActor {
  type: "user" | "system";
  id?: Types.ObjectId | string | undefined;
}

interface TransitionInput {
  orderId: Types.ObjectId | string;
  from: OrderStatus;
  to: OrderStatus;
  actor: TransitionActor;
  reason?: string;
  /** Extra fields written in the SAME atomic update (e.g. paidAt, payment.status). */
  set?: Record<string, unknown>;
  session?: ClientSession;
  /** Extra conditions for the SAME atomic filter (e.g. the label is still ready). */
  where?: Record<string, unknown>;
}

const applyOrderTransition = async (input: TransitionInput): Promise<OrderDocument | null> => {
  const { orderId, from, to, actor, reason, set, session, where } = input;
  assertTransition(from, to);

  return Order.findOneAndUpdate(
    { ...where, _id: orderId, status: from },
    {
      $set: { ...set, status: to },
      // Same atomic update as the status change, so no writer can skip it.
      ...(FULFILLMENT_STATUSES.has(to) ? { $min: { fulfillmentStartedAt: new Date() } } : {}),
      $push: {
        statusHistory: {
          $each: [
            {
              status: to,
              at: new Date(),
              actorType: actor.type,
              ...(actor.id ? { actorId: actor.id } : {}),
              ...(reason ? { reason } : {}),
            },
          ],
          $slice: -MAX_STATUS_HISTORY,
        },
      },
    },
    { new: true, ...(session ? { session } : {}) },
  );
};

export type { TransitionActor, TransitionInput };
export { applyOrderTransition };
