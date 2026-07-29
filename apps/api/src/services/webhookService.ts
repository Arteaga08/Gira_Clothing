import mongoose from "mongoose";
import { WebhookEvent, PURGE_AFTER_DAYS } from "../models/WebhookEvent.js";
import { Order } from "../models/Order.js";
import { ProviderEventType, getPaymentProvider, type ProviderEvent } from "../adapters/payment/index.js";
import { logger } from "../config/logger.js";
import {
  applyPaymentSucceeded,
  applyPaymentFailed,
  applyPaymentCancelled,
  applyRefund,
  applyDisputeOpened,
  applyDisputeClosed,
} from "./orderPaymentService.js";

/**
 * Dedupe + dispatch for provider webhooks. The dedupe insert IS the
 * exactly-once guarantee (unique index on provider+eventId) — two concurrent
 * deliveries race for the same insert, the loser gets E11000 and returns
 * "duplicate" without ever calling an effect. A genuinely failed attempt
 * (unexpected error after the claim) is NOT retried through redelivery by
 * design: the reconciliation job (Tarea 15) is the real safety net, since it
 * checks provider truth directly instead of hoping Stripe resends.
 */

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: number }).code === 11000;

const purgeDate = (): Date => new Date(Date.now() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

/** metadata.orderId is our own Order _id (set at creation); paymentId is the fallback. */
const resolveOrderId = async (event: ProviderEvent): Promise<mongoose.Types.ObjectId | null> => {
  if (event.orderId && mongoose.isValidObjectId(event.orderId)) {
    const order = await Order.findById(event.orderId).select("_id").lean();
    if (order) return order._id;
  }
  if (event.paymentId) {
    const order = await Order.findOne({ "payment.intentId": event.paymentId })
      .select("_id")
      .lean();
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

const handleProviderEvent = async (event: ProviderEvent): Promise<"processed" | "duplicate"> => {
  try {
    await WebhookEvent.create({
      provider: "stripe",
      eventId: event.id,
      type: event.type,
      status: event.type === ProviderEventType.IGNORED ? "ignored" : "processed",
      purgeAt: purgeDate(),
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) return "duplicate";
    throw err;
  }

  const orderId = await resolveOrderId(event);
  if (!orderId) {
    logger.warn({ eventId: event.id, type: event.type }, "Webhook sin orden resoluble");
    return "processed"; // unknown order: ack, do not retry forever
  }

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
      await applyRefund(orderId);
      break;
    case ProviderEventType.DISPUTE_OPENED:
      await applyDisputeOpened(orderId);
      break;
    case ProviderEventType.DISPUTE_CLOSED_WON:
      await applyDisputeClosed(orderId, true);
      break;
    case ProviderEventType.DISPUTE_CLOSED_LOST:
      await applyDisputeClosed(orderId, false);
      break;
    default:
      break; // IGNORED
  }
  return "processed";
};

export { handleStripeWebhook, handleProviderEvent };
