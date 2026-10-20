import { NotificationChannelKind, NotificationType } from "@gira/shared";
import { getMailer } from "../adapters/mailer/index.js";
import { getNotificationChannel } from "../adapters/notification/index.js";
import {
  claimNextBatch,
  markSent,
  markSkipped,
  markFailed,
} from "../services/notificationService.js";
import {
  renderOrderConfirmation,
  renderOrderPreparing,
  renderOrderShipped,
  renderOrderDelivered,
  type OrderEmailSnapshot,
  type ShippedEmailSnapshot,
  type RenderedMail,
} from "../templates/orderEmails.js";
import {
  renderTeamOrderPaid,
  renderTeamPaymentFailed,
  renderTeamPaymentNeedsReview,
  renderTeamDisputeLost,
  renderTeamShipmentIncident,
  renderTeamShippingLabelFailed,
  renderTeamShippingLabelCancelFailed,
  renderTeamStockOut,
  renderTeamStockLow,
  type TeamOrderSnapshot,
  type TeamStockSnapshot,
} from "../templates/teamMessages.js";
import type { TeamMessage } from "../adapters/notification/types.js";
import type { NotificationDocument } from "../models/Notification.js";
import { logger } from "../config/logger.js";

/**
 * Drains the outbox. Rendering happens HERE, at delivery time, from the payload
 * snapshot frozen at enqueue time — so a template fix reaches messages that are
 * still queued, while the data they describe never drifts.
 *
 * Exported as a plain async function so tests drive it directly; the scheduler
 * is the only thing that puts it on a timer.
 */

const BATCH = 20;

const renderEmail = (doc: NotificationDocument): RenderedMail => {
  const payload = doc.payload as unknown;
  switch (doc.type) {
    case NotificationType.ORDER_CONFIRMATION:
      return renderOrderConfirmation(payload as OrderEmailSnapshot);
    case NotificationType.ORDER_PREPARING:
      return renderOrderPreparing(payload as OrderEmailSnapshot);
    case NotificationType.ORDER_SHIPPED:
      return renderOrderShipped(payload as ShippedEmailSnapshot);
    case NotificationType.ORDER_DELIVERED:
      return renderOrderDelivered(payload as ShippedEmailSnapshot);
    default:
      throw new Error(`Tipo de correo no soportado: ${doc.type}`);
  }
};

const renderTeam = (doc: NotificationDocument): TeamMessage => {
  const payload = doc.payload;
  switch (doc.type) {
    case NotificationType.TEAM_ORDER_PAID:
      return renderTeamOrderPaid(payload as unknown as TeamOrderSnapshot);
    case NotificationType.TEAM_PAYMENT_FAILED:
      return renderTeamPaymentFailed(
        String(payload.orderNumber),
        typeof payload.reason === "string" ? payload.reason : undefined,
      );
    case NotificationType.TEAM_PAYMENT_NEEDS_REVIEW:
      return renderTeamPaymentNeedsReview(String(payload.orderNumber), String(payload.reason));
    case NotificationType.TEAM_DISPUTE_LOST:
      return renderTeamDisputeLost(String(payload.orderNumber));
    case NotificationType.TEAM_SHIPMENT_INCIDENT:
      return renderTeamShipmentIncident(
        String(payload.orderNumber),
        String(payload.status),
        String(payload.carrier),
      );
    case NotificationType.TEAM_SHIPPING_LABEL_FAILED:
      return renderTeamShippingLabelFailed(String(payload.orderNumber), String(payload.reason));
    case NotificationType.TEAM_SHIPPING_LABEL_CANCEL_FAILED:
      return renderTeamShippingLabelCancelFailed(String(payload.orderNumber));
    case NotificationType.TEAM_STOCK_OUT:
      return renderTeamStockOut(payload as unknown as TeamStockSnapshot);
    case NotificationType.TEAM_STOCK_LOW:
      return renderTeamStockLow(payload as unknown as TeamStockSnapshot);
    default:
      throw new Error(`Tipo de aviso no soportado: ${doc.type}`);
  }
};

/** What happened to a claimed message: delivered, or skipped because its channel is unconfigured. */
const deliver = async (doc: NotificationDocument): Promise<"sent" | "skipped"> => {
  if (doc.channel === NotificationChannelKind.EMAIL) {
    const mail = renderEmail(doc);
    const { providerId } = await getMailer().send({ to: doc.to, ...mail });
    await markSent(doc._id, providerId);
    return "sent";
  }

  const { delivered } = await getNotificationChannel().notify(renderTeam(doc));
  if (!delivered) {
    await markSkipped(doc._id);
    return "skipped";
  }
  await markSent(doc._id, "team");
  return "sent";
};

const dispatchNotifications = async (): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> => {
  const claimed = await claimNextBatch(BATCH);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of claimed) {
    try {
      const outcome = await deliver(doc);
      if (outcome === "sent") sent += 1;
      else skipped += 1;
    } catch (err) {
      // One bad message must not stop the sweep.
      failed += 1;
      const reason = err instanceof Error ? err.message : "Error desconocido";
      logger.error({ err, notification: String(doc._id) }, "No se pudo entregar la notificación");
      await markFailed(doc, reason);
    }
  }

  return { sent, failed, skipped };
};

export { dispatchNotifications };
