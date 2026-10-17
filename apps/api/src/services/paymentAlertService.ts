import { AuditModule, NotificationChannelKind, NotificationType, type AuditAction } from "@gira/shared";
import type { Types } from "mongoose";
import { recordAudit } from "./auditService.js";
import { enqueueNotification } from "./notificationService.js";

/**
 * The one alarm a human must act on when money and inventory disagree. Shared
 * by the payment effects and the expiry job so both raise it the same way.
 *
 * The audit entry and the alert carry only the folio and a short internal
 * reason code — no customer data reaches the Telegram group.
 *
 * `dedupePerOrder` decides whether the alert takes the order's single
 * `team_payment_needs_review` outbox slot (unique on order+type). Alerts that
 * can legitimately be followed by a different, more serious one on the same
 * order (a failed intent cancel, then a payment after expiry) must NOT take it,
 * or the later alert would be silently swallowed as a duplicate.
 */
interface FlagTarget {
  _id: Types.ObjectId;
  publicId: string;
  status: string;
}

interface FlagOptions {
  dedupePerOrder?: boolean;
  /** Rethrow a failed enqueue so a webhook effect is retried instead of losing the alert. */
  strict?: boolean;
}

const flagForReview = async (
  order: FlagTarget,
  reason: string,
  action: AuditAction,
  { dedupePerOrder = true, strict = false }: FlagOptions = {},
): Promise<void> => {
  await recordAudit({
    actorType: "system",
    action,
    module: AuditModule.PAYMENTS,
    targetId: order.publicId,
    after: { reason, status: order.status },
  });
  await enqueueNotification(
    {
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_PAYMENT_NEEDS_REVIEW,
      to: "team",
      ...(dedupePerOrder ? { order: order._id } : {}),
      payload: { publicId: order.publicId, reason },
    },
    { strict },
  );
};

export type { FlagTarget, FlagOptions };
export { flagForReview };
