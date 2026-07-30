import type { Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  NotificationChannelKind,
  NotificationStatus,
  NotificationType,
} from "@gira/shared";
import type { OutboxHealth, FailedNotificationSample } from "@gira/shared";
import { Notification, PURGE_AFTER_DAYS, type NotificationDocument } from "../models/Notification.js";
import { recordAudit } from "./auditService.js";
import { logger } from "../config/logger.js";

/**
 * Outbox access. Enqueue is BEST-EFFORT by contract: a failure to queue a
 * notification must never roll back the payment it was announcing — same rule
 * as recordAudit (BACKEND_SECURITY_GUIDELINES §10).
 *
 * The claim is an atomic findOneAndUpdate whose filter carries the state
 * (`status: pending`). That filter IS the exactly-once ticket: two dispatcher
 * runs racing for the same document, exactly one wins — the same pattern M3
 * uses for the reservation flip.
 */

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60 * 1000;
/** A `sending` document older than this was orphaned by a dead process. */
const STALE_SENDING_MS = 10 * 60 * 1000;

const purgeDate = (): Date => new Date(Date.now() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

/** 1, 2, 4, 8, 16 minutes — enough to ride out an outage without hammering. */
const backoffFrom = (attempts: number): Date =>
  new Date(Date.now() + BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: number }).code === 11000;

interface EnqueueInput {
  channel: NotificationChannelKind;
  type: NotificationType;
  to: string;
  order?: Types.ObjectId | undefined;
  payload: Record<string, unknown>;
}

/** Returns false when the message was already queued (duplicate) or failed to queue. */
const enqueueNotification = async (input: EnqueueInput): Promise<boolean> => {
  try {
    await Notification.create({
      channel: input.channel,
      type: input.type,
      to: input.to,
      ...(input.order ? { order: input.order } : {}),
      payload: input.payload,
      status: NotificationStatus.PENDING,
      attempts: 0,
      nextAttemptAt: new Date(),
    });
    return true;
  } catch (err) {
    // Already queued for this (order, type): the effect already landed.
    if (isDuplicateKeyError(err)) return false;
    logger.error({ err, type: input.type }, "No se pudo encolar la notificación");
    return false;
  }
};

/**
 * Claims up to `limit` messages, one atomic flip at a time. Sequential on
 * purpose: a bulk update could not tell us WHICH documents we won, and the
 * batch is small by design.
 */
const claimNextBatch = async (limit: number): Promise<NotificationDocument[]> => {
  const claimed: NotificationDocument[] = [];
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS);

  for (let i = 0; i < limit; i += 1) {
    const doc = await Notification.findOneAndUpdate(
      {
        $or: [
          { status: NotificationStatus.PENDING, nextAttemptAt: { $lte: new Date() } },
          // Orphan recovery: a process that died mid-send left this behind.
          { status: NotificationStatus.SENDING, updatedAt: { $lt: staleBefore } },
        ],
      },
      { $set: { status: NotificationStatus.SENDING }, $inc: { attempts: 1 } },
      { new: true, sort: { nextAttemptAt: 1 } },
    );
    if (!doc) break;
    claimed.push(doc);
  }

  return claimed;
};

const markSent = async (id: Types.ObjectId, providerId: string): Promise<void> => {
  await Notification.updateOne(
    { _id: id },
    {
      $set: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        purgeAt: purgeDate(),
        providerId,
      },
      $unset: { lastError: "" },
    },
  );
};

/** Back to pending with backoff, or terminal once the attempts run out. */
const markFailed = async (doc: NotificationDocument, error: string): Promise<void> => {
  const giveUp = doc.attempts >= MAX_ATTEMPTS;

  await Notification.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: giveUp ? NotificationStatus.FAILED : NotificationStatus.PENDING,
        lastError: error.slice(0, 300),
        nextAttemptAt: backoffFrom(doc.attempts),
        ...(giveUp ? { purgeAt: purgeDate() } : {}),
      },
    },
  );

  if (giveUp) {
    // Audited only on the FINAL failure: one entry per lost message, not one
    // per retry. No recipient here — never PII in the audit trail (§10).
    await recordAudit({
      actorType: "system",
      action: AuditAction.NOTIFICATION_FAILED,
      module: AuditModule.NOTIFICATIONS,
      ...(doc.order ? { targetId: String(doc.order) } : {}),
      after: { type: doc.type, channel: doc.channel, attempts: doc.attempts },
    });
  }
};

const FAILED_SAMPLE_SIZE = 5;
const LAST_ERROR_MAX_LENGTH = 200;

interface StatusCountRow {
  _id: NotificationStatus;
  count: number;
}

interface FailedSampleLean {
  _id: unknown;
  channel: FailedNotificationSample["channel"];
  type: FailedNotificationSample["type"];
  attempts: number;
  lastError?: string;
  updatedAt: Date;
}

/**
 * Read-only outbox health for the dashboard's notification card. Deliberately
 * omits `to` (a customer's email) and `payload` (name + email) from the
 * failed sample — this is an operational health check, not a place a
 * customer's PII should surface. `lastError` is provider text and gets
 * truncated so a provider echoing the recipient back can't leak it whole.
 */
const getOutboxHealth = async (): Promise<OutboxHealth> => {
  const [statusRows, oldestPending, failedDocs] = await Promise.all([
    Notification.aggregate<StatusCountRow>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Notification.findOne({ status: NotificationStatus.PENDING })
      .sort({ nextAttemptAt: 1 })
      .select("nextAttemptAt")
      .lean(),
    Notification.find({ status: NotificationStatus.FAILED })
      .sort({ updatedAt: -1 })
      .limit(FAILED_SAMPLE_SIZE)
      .select("channel type attempts lastError updatedAt")
      .lean(),
  ]);

  const countOf = (status: NotificationStatus): number =>
    statusRows.find((r) => r._id === status)?.count ?? 0;

  return {
    pending: countOf(NotificationStatus.PENDING),
    sending: countOf(NotificationStatus.SENDING),
    failed: countOf(NotificationStatus.FAILED),
    sent: countOf(NotificationStatus.SENT),
    // Reserved: no distinct STALE status exists. A SENDING doc past
    // STALE_SENDING_MS is transient and reclaimed by the next dispatcher
    // run, not a separate queryable state — see Pendientes conocidos.
    stale: 0,
    oldestPendingAt: (oldestPending as { nextAttemptAt?: Date } | null)?.nextAttemptAt ?? null,
    failedSample: (failedDocs as unknown as FailedSampleLean[]).map((doc) => ({
      id: String(doc._id),
      channel: doc.channel,
      type: doc.type,
      attempts: doc.attempts,
      ...(doc.lastError ? { lastError: doc.lastError.slice(0, LAST_ERROR_MAX_LENGTH) } : {}),
      updatedAt: doc.updatedAt,
    })),
  };
};

export type { EnqueueInput };
export {
  enqueueNotification,
  claimNextBatch,
  markSent,
  markFailed,
  MAX_ATTEMPTS,
  getOutboxHealth,
};
