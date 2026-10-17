import { Schema, model, type HydratedDocument, type Model } from "mongoose";

/**
 * Persisted webhook dedupe (ECOMMERCE_ARCHITECTURE_GUIDELINES, "Dedupe
 * persistido por event.id"). Providers RE-DELIVER events by design — on their
 * own retry schedule, and after any non-2xx we return.
 *
 * The unique index on (provider, eventId) IS the dedupe, not a pre-read: an
 * insert that throws E11000 means "someone else already claimed this event",
 * which makes two concurrent deliveries safe without a lock.
 *
 * Lifecycle: `processing` (claimed, effect running) -> `processed` | `failed`.
 * `ignored` is for event types we acknowledge and never act on. Only a
 * `failed` row, or a `processing` row whose claimer died (stale `updatedAt`),
 * may be re-claimed by a redelivery — a `processed` row never is.
 *
 * The raw payload is deliberately NOT stored, so a `failed` event can only be
 * re-driven by the provider's own redelivery (Stripe retries for days) or a
 * manual resend from its dashboard; `error` is what tells you which to resend.
 */

const PURGE_AFTER_DAYS = 90;

type WebhookEventStatus = "processing" | "processed" | "ignored" | "failed";

interface WebhookEventAttrs {
  provider: string;
  eventId: string;
  type: string;
  status: WebhookEventStatus;
  attempts: number;
  error?: string;
  orderId?: string;
  purgeAt: Date;
}

type WebhookEventModel = Model<WebhookEventAttrs>;
type WebhookEventDocument = HydratedDocument<WebhookEventAttrs>;

const webhookEventSchema = new Schema<WebhookEventAttrs, WebhookEventModel>(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    status: {
      type: String,
      enum: ["processing", "processed", "ignored", "failed"],
      required: true,
    },
    attempts: { type: Number, default: 1 },
    error: { type: String },
    orderId: { type: String },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const WebhookEvent = model<WebhookEventAttrs, WebhookEventModel>("WebhookEvent", webhookEventSchema);

export type { WebhookEventAttrs, WebhookEventDocument, WebhookEventStatus };
export { WebhookEvent, PURGE_AFTER_DAYS };
