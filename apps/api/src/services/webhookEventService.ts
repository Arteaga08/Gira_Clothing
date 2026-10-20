import { WebhookEvent, PURGE_AFTER_DAYS } from "../models/WebhookEvent.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/AppError.js";

/**
 * Provider-agnostic exactly-once claim for webhook deliveries. The dedupe insert
 * IS the guarantee (unique index on provider+eventId). A failed claim is retaken
 * once by a redelivery; a fresh `processing` row means "in flight" (409).
 */

/** A `processing` claim older than this is a crashed process, not a slow one. */
const STALE_PROCESSING_MS = 5 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: number }).code === 11000;

const purgeDate = (): Date => new Date(Date.now() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

interface WebhookDelivery {
  /** The provider's unique id for this delivery. */
  id: string;
  type: string;
  /** Type we do not act on: stored as `ignored`, no effect run. */
  ignored?: boolean;
}

type Claim = { kind: "claimed"; attempt: number } | { kind: "duplicate" } | { kind: "in_flight" };

/**
 * Decides who runs the effect. A fresh insert wins outright; on E11000 the only
 * rows a redelivery may take over are `failed` ones and `processing` ones whose
 * claimer died. The takeover is a single conditional update, so two concurrent
 * redeliveries cannot both win it.
 */
const claimEvent = async (provider: string, delivery: WebhookDelivery): Promise<Claim> => {
  try {
    await WebhookEvent.create({
      provider,
      eventId: delivery.id,
      type: delivery.type,
      status: delivery.ignored ? "ignored" : "processing",
      purgeAt: purgeDate(),
    });
    return { kind: "claimed", attempt: 1 };
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }

  const reclaimed = await WebhookEvent.findOneAndUpdate(
    {
      provider,
      eventId: delivery.id,
      $or: [
        { status: "failed" },
        { status: "processing", updatedAt: { $lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
      ],
    },
    { $set: { status: "processing" }, $unset: { error: 1 }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (reclaimed) return { kind: "claimed", attempt: reclaimed.attempts };

  const existing = await WebhookEvent.findOne({ provider, eventId: delivery.id })
    .select("status")
    .lean();
  return existing?.status === "processing" ? { kind: "in_flight" } : { kind: "duplicate" };
};

const markEvent = async (
  provider: string,
  eventId: string,
  status: "processed" | "failed" | "ignored",
  attempt: number,
  extra: { orderId?: string; error?: string } = {},
): Promise<void> => {
  // Pinned to THIS attempt: a slow attempt already taken over must not overwrite the replacement's outcome.
  await WebhookEvent.updateOne(
    { provider, eventId, status: "processing", attempts: attempt },
    { $set: { status, ...extra } },
  );
};

/**
 * Claims the delivery, runs `effect`, records the outcome.
 * - duplicate -> "duplicate"; in flight -> 409; ignored type -> "processed".
 * - `effect` returns the resolved order id (or null when none applies).
 * - A 4xx AppError is deterministic: terminal `ignored`, acked.
 * - Anything else is `failed` and rethrown so the provider redelivers.
 */
const runWebhookEvent = async (
  provider: string,
  delivery: WebhookDelivery,
  effect: () => Promise<string | null>,
): Promise<"processed" | "duplicate"> => {
  const claim = await claimEvent(provider, delivery);
  if (claim.kind === "duplicate") return "duplicate";
  if (claim.kind === "in_flight") throw new AppError("El evento se está procesando.", 409);
  if (delivery.ignored) return "processed";
  const { attempt } = claim;

  try {
    const orderId = await effect();
    await markEvent(provider, delivery.id, "processed", attempt, orderId ? { orderId } : {});
    return "processed";
  } catch (err) {
    if (err instanceof AppError && err.statusCode >= 400 && err.statusCode < 500) {
      logger.warn(
        { err, eventId: delivery.id, type: delivery.type, provider },
        "Webhook rechazado por regla de negocio",
      );
      await markEvent(provider, delivery.id, "ignored", attempt, {
        error: err.message.slice(0, MAX_ERROR_LENGTH),
      });
      return "processed";
    }
    const message = (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_LENGTH);
    logger.error(
      { err, eventId: delivery.id, type: delivery.type, provider },
      "Falló el efecto de un webhook",
    );
    await markEvent(provider, delivery.id, "failed", attempt, { error: message }).catch(
      (markErr: unknown) => {
        logger.error(
          { err: markErr, eventId: delivery.id },
          "No se pudo marcar el webhook como fallido",
        );
      },
    );
    throw err;
  }
};

export type { WebhookDelivery };
export { runWebhookEvent };
