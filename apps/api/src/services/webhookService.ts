import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import {
  ProviderEventType,
  getPaymentProvider,
  type ProviderEvent,
} from "../adapters/payment/index.js";
import { logger } from "../config/logger.js";
import {
  applyPaymentSucceeded,
  applyPaymentFailed,
  applyPaymentCancelled,
  applyRefund,
  applyDisputeOpened,
  applyDisputeClosed,
} from "./orderPaymentService.js";
import { runWebhookEvent } from "./webhookEventService.js";

/**
 * Dedupe + dispatch for provider webhooks. The dedupe insert IS the
 * exactly-once guarantee (unique index on provider+eventId) — two concurrent
 * deliveries race for the same insert, the loser gets E11000 and returns
 * "duplicate" without ever calling an effect. A claim whose effect THROWS is
 * recorded as `failed` and the error is rethrown, so the provider's retry
 * reaches `claimEvent`, which lets a failed (or crashed-while-processing)
 * event be taken over exactly once. The reconciliation job remains the
 * safety net for payments the provider never delivers at all.
 */

/** metadata.orderId is our own Order _id (set at creation); paymentId is the fallback. */
const resolveOrderId = async (event: ProviderEvent): Promise<mongoose.Types.ObjectId | null> => {
  if (event.orderId && mongoose.isValidObjectId(event.orderId)) {
    const order = await Order.findById(event.orderId).select("_id").lean();
    if (order) return order._id;
  }
  if (event.paymentId) {
    const order = await Order.findOne({ "payment.intentId": event.paymentId }).select("_id").lean();
    if (order) return order._id;
  }
  return null;
};

/**
 * Entry point for the webhook controller: parses + verifies the raw Stripe
 * payload, then dispatches. Kept here (not in the controller) so controllers
 * never touch adapters/ directly — only services reach third-party SDKs.
 */
const handleStripeWebhook = async (
  rawBody: Buffer,
  signature: string,
): Promise<"processed" | "duplicate"> => {
  const event = getPaymentProvider().parseWebhookEvent(rawBody, signature);
  return handleProviderEvent(event);
};

const dispatchEffect = async (
  event: ProviderEvent,
  orderId: mongoose.Types.ObjectId,
): Promise<void> => {
  switch (event.type) {
    case ProviderEventType.PAYMENT_SUCCEEDED:
      await applyPaymentSucceeded(orderId);
      break;
    case ProviderEventType.PAYMENT_FAILED:
      await applyPaymentFailed(orderId, event.reason);
      break;
    case ProviderEventType.PAYMENT_CANCELLED:
      await applyPaymentCancelled(orderId);
      break;
    case ProviderEventType.PAYMENT_REFUNDED:
      await applyRefund(orderId, event.amountRefunded);
      break;
    case ProviderEventType.DISPUTE_OPENED:
      await applyDisputeOpened(orderId);
      break;
    case ProviderEventType.DISPUTE_CLOSED:
      await applyDisputeClosed(orderId, event.disputeStatus);
      break;
    default:
      break; // IGNORED
  }
};

const handleProviderEvent = async (event: ProviderEvent): Promise<"processed" | "duplicate"> =>
  runWebhookEvent(
    "stripe",
    { id: event.id, type: event.type, ignored: event.type === ProviderEventType.IGNORED },
    async () => {
      const orderId = await resolveOrderId(event);
      if (!orderId) {
        logger.warn({ eventId: event.id, type: event.type }, "Webhook sin orden resoluble");
        return null; // unknown order: ack, do not retry forever
      }
      await dispatchEffect(event, orderId);
      return String(orderId);
    },
  );

export { handleStripeWebhook, handleProviderEvent };
