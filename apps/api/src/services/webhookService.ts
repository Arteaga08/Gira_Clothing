import mongoose from "mongoose";
import { WebhookEvent, PURGE_AFTER_DAYS } from "../models/WebhookEvent.js";
import { Order } from "../models/Order.js";
import { ProviderEventType, getPaymentProvider, type ProviderEvent } from "../adapters/payment/index.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/AppError.js";
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
 * "duplicate" without ever calling an effect. A claim whose effect THROWS is
 * recorded as `failed` and the error is rethrown, so the provider's retry
 * reaches `claimEvent`, which lets a failed (or crashed-while-processing)
 * event be taken over exactly once. The reconciliation job remains the
 * safety net for payments the provider never delivers at all.
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

/** A `processing` claim older than this is a crashed process, not a slow one. */
const STALE_PROCESSING_MS = 5 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;

type Claim = { kind: "claimed"; attempt: number } | { kind: "duplicate" } | { kind: "in_flight" };

/**
 * Decides who runs the effect. A fresh insert wins outright; on E11000 the only
 * rows a redelivery may take over are `failed` ones and `processing` ones whose
 * claimer died. The takeover is a single conditional update, so two concurrent
 * redeliveries cannot both win it. A fresh `processing` row is `in_flight`: the
 * caller answers non-2xx so the provider retries later instead of treating an
 * attempt that may still crash as done.
 */
const claimEvent = async (event: ProviderEvent): Promise<Claim> => {
  try {
    await WebhookEvent.create({
      provider: "stripe",
      eventId: event.id,
      type: event.type,
      status: event.type === ProviderEventType.IGNORED ? "ignored" : "processing",
      purgeAt: purgeDate(),
    });
    return { kind: "claimed", attempt: 1 };
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }

  const reclaimed = await WebhookEvent.findOneAndUpdate(
    {
      provider: "stripe",
      eventId: event.id,
      $or: [
        { status: "failed" },
        { status: "processing", updatedAt: { $lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
      ],
    },
    { $set: { status: "processing" }, $unset: { error: 1 }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (reclaimed) return { kind: "claimed", attempt: reclaimed.attempts };

  const existing = await WebhookEvent.findOne({ provider: "stripe", eventId: event.id })
    .select("status")
    .lean();
  return existing?.status === "processing" ? { kind: "in_flight" } : { kind: "duplicate" };
};

const markEvent = async (
  event: ProviderEvent,
  status: "processed" | "failed" | "ignored",
  attempt: number,
  extra: { orderId?: string; error?: string } = {},
): Promise<void> => {
  // Pinned to THIS attempt: a slow attempt that was already taken over must not
  // overwrite the outcome of the attempt that replaced it.
  await WebhookEvent.updateOne(
    { provider: "stripe", eventId: event.id, status: "processing", attempts: attempt },
    { $set: { status, ...extra } },
  );
};

const dispatchEffect = async (event: ProviderEvent, orderId: mongoose.Types.ObjectId): Promise<void> => {
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

const handleProviderEvent = async (event: ProviderEvent): Promise<"processed" | "duplicate"> => {
  const claim = await claimEvent(event);
  if (claim.kind === "duplicate") return "duplicate";
  if (claim.kind === "in_flight") throw new AppError("El evento se está procesando.", 409);
  if (event.type === ProviderEventType.IGNORED) return "processed";
  const { attempt } = claim;

  try {
    const orderId = await resolveOrderId(event);
    if (!orderId) {
      logger.warn({ eventId: event.id, type: event.type }, "Webhook sin orden resoluble");
      await markEvent(event, "processed", attempt);
      return "processed"; // unknown order: ack, do not retry forever
    }

    await dispatchEffect(event, orderId);
    await markEvent(event, "processed", attempt, { orderId: String(orderId) });
    return "processed";
  } catch (err) {
    // A 4xx AppError is deterministic (e.g. an illegal transition: a refund for
    // an expired order). Redelivering would fail identically for days and could
    // get the endpoint disabled, so it is terminal: ack, keep the reason.
    if (err instanceof AppError && err.statusCode >= 400 && err.statusCode < 500) {
      logger.warn({ err, eventId: event.id, type: event.type }, "Webhook rechazado por regla de negocio");
      await markEvent(event, "ignored", attempt, { error: err.message.slice(0, MAX_ERROR_LENGTH) });
      return "processed";
    }
    // The claim must not turn a failed effect into a permanent "duplicate":
    // record the failure and rethrow so the provider gets a 5xx and retries.
    const message = (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_LENGTH);
    logger.error({ err, eventId: event.id, type: event.type }, "Falló el efecto de un webhook");
    await markEvent(event, "failed", attempt, { error: message }).catch((markErr: unknown) => {
      logger.error({ err: markErr, eventId: event.id }, "No se pudo marcar el webhook como fallido");
    });
    throw err;
  }
};

export { handleStripeWebhook, handleProviderEvent };
