import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { NotificationChannelKind, NotificationStatus, NotificationType } from "@gira/shared";

/**
 * Transactional outbox. Nothing is sent inline: business code enqueues, the
 * dispatcher job delivers. That buys two things a direct send cannot:
 *
 *  1. EXACTLY-ONE per (order, type), enforced by a partial unique index.
 *     applyPaymentSucceeded runs from the webhook AND from the reconciliation
 *     job — without this index the customer gets two confirmation emails.
 *  2. Retries. A 30-second Resend outage costs a retry, not a lost purchase
 *     confirmation.
 *
 * `purgeAt` carries the TTL index and is set ONLY on a terminal state
 * (sent/failed) — same discipline as StockReservation in M3: the TTL index is a
 * garbage collector, never the mechanism that decides anything.
 */

const PURGE_AFTER_DAYS = 30;

interface NotificationAttrs {
  channel: NotificationChannelKind;
  type: NotificationType;
  /** Email address, or the team channel id. Operational data, never audited. */
  to: string;
  order?: Types.ObjectId;
  /** Flat snapshot the template renders. No secrets, no Mongoose documents. */
  payload: Record<string, unknown>;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError?: string;
  providerId?: string;
  sentAt?: Date;
  purgeAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type NotificationModel = Model<NotificationAttrs>;
type NotificationDocument = HydratedDocument<NotificationAttrs>;

const notificationSchema = new Schema<NotificationAttrs, NotificationModel>(
  {
    channel: { type: String, enum: Object.values(NotificationChannelKind), required: true },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    to: { type: String, required: true, trim: true },
    order: { type: Schema.Types.ObjectId, ref: "Order" },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: Object.values(NotificationStatus),
      required: true,
      default: NotificationStatus.PENDING,
    },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    nextAttemptAt: { type: Date, required: true, default: () => new Date() },
    lastError: { type: String },
    providerId: { type: String },
    sentAt: { type: Date },
    purgeAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The exactly-one guarantee. PARTIAL on purpose: team pings carry no order, and
// several of them may legitimately exist for the same type.
notificationSchema.index(
  { order: 1, type: 1 },
  { unique: true, partialFilterExpression: { order: { $exists: true } } },
);
// The dispatcher's hot query: pending work whose time has come.
notificationSchema.index({ status: 1, nextAttemptAt: 1 });
// Garbage collection of terminal documents only.
notificationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const Notification = model<NotificationAttrs, NotificationModel>(
  "Notification",
  notificationSchema,
);

export type { NotificationAttrs, NotificationDocument };
export { Notification, PURGE_AFTER_DAYS };
