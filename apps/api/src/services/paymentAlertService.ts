import { AuditModule, NotificationChannelKind, NotificationType, type AuditAction } from "@gira/shared";
import type { Types } from "mongoose";
import { recordAudit } from "./auditService.js";
import { enqueueNotification } from "./notificationService.js";
import { Notification } from "../models/Notification.js";

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
  orderNumber: string;
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
  const queued = await enqueueNotification(
    {
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_PAYMENT_NEEDS_REVIEW,
      to: "team",
      ...(dedupePerOrder ? { order: order._id } : {}),
      payload: { orderNumber: order.orderNumber, reason },
    },
    { strict },
  );
  // A retry that finds the SAME alert already queued must not stack a second
  // identical audit entry. Anything else is audited: this call queued it, the
  // enqueue failed (non-strict), or the slot holds a different reason — the
  // audit trail is the only place that one survives. A failed strict enqueue
  // throws before this line, so its retry audits exactly once.
  let repeat = false;
  if (!queued && dedupePerOrder) {
    const existing = await Notification.findOne({
      order: order._id,
      type: NotificationType.TEAM_PAYMENT_NEEDS_REVIEW,
    })
      .select("payload.reason")
      .lean();
    repeat = (existing?.payload as { reason?: string } | undefined)?.reason === reason;
  }
  if (!repeat) {
    await recordAudit({
      actorType: "system",
      action,
      module: AuditModule.PAYMENTS,
      targetId: String(order._id),
      after: { reason, status: order.status },
    });
  }
};

export type { FlagTarget, FlagOptions };
export { flagForReview };
