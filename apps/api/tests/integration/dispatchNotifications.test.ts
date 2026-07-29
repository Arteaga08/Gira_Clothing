import { describe, it, expect, vi, afterEach } from "vitest";
import mongoose from "mongoose";
import { NotificationChannelKind, NotificationStatus, NotificationType } from "@gira/shared";
import { Notification } from "../../src/models/Notification.js";
import { getMailer } from "../../src/adapters/mailer/index.js";
import { getNotificationChannel } from "../../src/adapters/notification/index.js";
import { enqueueNotification } from "../../src/services/notificationService.js";
import { dispatchNotifications } from "../../src/jobs/dispatchNotifications.js";

const orderId = (): mongoose.Types.ObjectId => new mongoose.Types.ObjectId();

const confirmationPayload = {
  publicId: "abc123",
  customerName: "Ana",
  currency: "MXN",
  subtotal: 1000,
  shippingCost: 100,
  total: 1100,
  lines: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dispatchNotifications", () => {
  it("despacha correos pendientes y los deja en sent con providerId y purgeAt", async () => {
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order: orderId(),
      payload: confirmationPayload,
    });
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_PREPARING,
      to: "clienta2@example.com",
      order: orderId(),
      payload: confirmationPayload,
    });

    const result = await dispatchNotifications();

    expect(result).toEqual({ sent: 2, failed: 0 });
    const docs = await Notification.find({ status: NotificationStatus.SENT });
    expect(docs).toHaveLength(2);
    for (const doc of docs) {
      expect(doc.providerId).toMatch(/^stub-/);
      expect(doc.purgeAt).toBeInstanceOf(Date);
    }
  });

  it("despacha un aviso de equipo por el NotificationChannel, no por el mailer", async () => {
    const mailerSpy = vi.spyOn(getMailer(), "send");
    const channelSpy = vi.spyOn(getNotificationChannel(), "notify").mockResolvedValue(undefined);

    await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_ORDER_PAID,
      to: "team",
      payload: { publicId: "abc123", total: 1100, currency: "MXN", itemCount: 2 },
    });

    const result = await dispatchNotifications();

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(channelSpy).toHaveBeenCalledOnce();
    expect(mailerSpy).not.toHaveBeenCalled();
  });

  it("un mailer que falla vuelve el mensaje a pending con backoff y no lo retoma de inmediato", async () => {
    vi.spyOn(getMailer(), "send").mockRejectedValueOnce(new Error("timeout"));

    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order: orderId(),
      payload: confirmationPayload,
    });

    const first = await dispatchNotifications();
    expect(first).toEqual({ sent: 0, failed: 1 });

    const doc = await Notification.findOne({});
    expect(doc?.status).toBe(NotificationStatus.PENDING);
    expect(doc?.attempts).toBe(1);
    expect(doc?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(doc?.lastError).toContain("timeout");

    // Immediately re-running must not re-claim it: nextAttemptAt is in the future.
    const second = await dispatchNotifications();
    expect(second).toEqual({ sent: 0, failed: 0 });
  });

  it("agota los intentos y deja el mensaje en failed", async () => {
    vi.spyOn(getMailer(), "send").mockRejectedValue(new Error("down"));

    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order: orderId(),
      payload: confirmationPayload,
    });
    await Notification.updateOne({}, { $set: { attempts: 5 } });

    const result = await dispatchNotifications();

    expect(result).toEqual({ sent: 0, failed: 1 });
    const doc = await Notification.findOne({});
    expect(doc?.status).toBe(NotificationStatus.FAILED);
  });

  it("un fallo en el medio no detiene el barrido: los otros dos quedan sent", async () => {
    const sendSpy = vi.spyOn(getMailer(), "send");
    sendSpy
      .mockResolvedValueOnce({ providerId: "ok-1" })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ providerId: "ok-3" });

    for (let i = 0; i < 3; i += 1) {
      await enqueueNotification({
        channel: NotificationChannelKind.EMAIL,
        type: NotificationType.ORDER_CONFIRMATION,
        to: `clienta${String(i)}@example.com`,
        order: orderId(),
        payload: confirmationPayload,
      });
    }

    const result = await dispatchNotifications();

    expect(result).toEqual({ sent: 2, failed: 1 });
    expect(await Notification.countDocuments({ status: NotificationStatus.SENT })).toBe(2);
    expect(await Notification.countDocuments({ status: NotificationStatus.PENDING })).toBe(1);
  });

  it("sin pendientes, no toca ningún adapter", async () => {
    const mailerSpy = vi.spyOn(getMailer(), "send");
    const channelSpy = vi.spyOn(getNotificationChannel(), "notify");

    const result = await dispatchNotifications();

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mailerSpy).not.toHaveBeenCalled();
    expect(channelSpy).not.toHaveBeenCalled();
  });

  it("un tipo/canal no soportado se marca failed sin escapar del job", async () => {
    // A genuinely mismatched combination (email type queued on the team channel)
    // hits the "unsupported type" branch instead of a real render path.
    await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "team",
      payload: confirmationPayload,
    });

    const result = await dispatchNotifications();

    expect(result).toEqual({ sent: 0, failed: 1 });
    const doc = await Notification.findOne({});
    expect(doc?.status).toBe(NotificationStatus.PENDING);
    expect(doc?.lastError).toBeTruthy();
  });
});
