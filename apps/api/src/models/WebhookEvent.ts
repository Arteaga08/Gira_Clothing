import { Schema, model, type HydratedDocument, type Model } from "mongoose";

/**
 * Persisted webhook dedupe (ECOMMERCE_ARCHITECTURE_GUIDELINES, "Dedupe
 * persistido por event.id"). Providers RE-DELIVER events by design — on their
 * own retry schedule, and after any non-2xx we return.
 *
 * The unique index on (provider, eventId) IS the dedupe, not a pre-read: an
 * insert that throws E11000 means "someone else already claimed this event",
 * which makes two concurrent deliveries safe without a lock.
 */

const PURGE_AFTER_DAYS = 90;

interface WebhookEventAttrs {
  provider: string;
  eventId: string;
  type: string;
  status: "processed" | "ignored";
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
    status: { type: String, enum: ["processed", "ignored"], required: true },
    orderId: { type: String },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const WebhookEvent = model<WebhookEventAttrs, WebhookEventModel>("WebhookEvent", webhookEventSchema);

export type { WebhookEventAttrs, WebhookEventDocument };
export { WebhookEvent, PURGE_AFTER_DAYS };
