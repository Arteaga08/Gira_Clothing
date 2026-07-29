import { NotificationChannelKind, NotificationType } from "@gira/shared";
import { getMailer } from "../adapters/mailer/index.js";
import { getNotificationChannel } from "../adapters/notification/index.js";
import { claimNextBatch, markSent, markFailed } from "../services/notificationService.js";
import {
  renderOrderConfirmation,
  renderOrderPreparing,
  renderOrderShipped,
  type OrderEmailSnapshot,
  type ShippedEmailSnapshot,
  type RenderedMail,
} from "../templates/orderEmails.js";
import {
  renderTeamOrderPaid,
  renderTeamPaymentFailed,
  renderTeamShipmentIncident,
  type TeamOrderSnapshot,
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
        String(payload.publicId),
        typeof payload.reason === "string" ? payload.reason : undefined,
      );
    case NotificationType.TEAM_SHIPMENT_INCIDENT:
      return renderTeamShipmentIncident(
        String(payload.publicId),
        String(payload.status),
        String(payload.carrier),
      );
    default:
      throw new Error(`Tipo de aviso no soportado: ${doc.type}`);
  }
};

const deliver = async (doc: NotificationDocument): Promise<void> => {
  if (doc.channel === NotificationChannelKind.EMAIL) {
    const mail = renderEmail(doc);
    const { providerId } = await getMailer().send({ to: doc.to, ...mail });
    await markSent(doc._id, providerId);
    return;
  }

  await getNotificationChannel().notify(renderTeam(doc));
  await markSent(doc._id, "team");
};

const dispatchNotifications = async (): Promise<{ sent: number; failed: number }> => {
  const claimed = await claimNextBatch(BATCH);
  let sent = 0;
  let failed = 0;

  for (const doc of claimed) {
    try {
      await deliver(doc);
      sent += 1;
    } catch (err) {
      // One bad message must not stop the sweep.
      failed += 1;
      const reason = err instanceof Error ? err.message : "Error desconocido";
      logger.error({ err, notification: String(doc._id) }, "No se pudo entregar la notificación");
      await markFailed(doc, reason);
    }
  }

  return { sent, failed };
};

export { dispatchNotifications };
