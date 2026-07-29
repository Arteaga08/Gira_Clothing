import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { AuditAction, NotificationChannelKind, NotificationStatus, NotificationType } from "@gira/shared";
import { Notification } from "../../src/models/Notification.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import {
  enqueueNotification,
  claimNextBatch,
  markSent,
  markFailed,
} from "../../src/services/notificationService.js";

const orderId = (): mongoose.Types.ObjectId => new mongoose.Types.ObjectId();

describe("notificationService · enqueueNotification", () => {
  it("encola una notificación pendiente lista para despacharse de inmediato", async () => {
    const order = orderId();
    const ok = await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order,
      payload: { total: 1000 },
    });

    expect(ok).toBe(true);
    const doc = await Notification.findOne({ order });
    expect(doc?.status).toBe(NotificationStatus.PENDING);
    expect(doc?.attempts).toBe(0);
    expect(doc?.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(doc?.purgeAt).toBeNull();
  });

  it("encolar el mismo (order, type) dos veces produce un solo documento, sin lanzar", async () => {
    const order = orderId();
    const input = {
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order,
      payload: {},
    };

    const first = await enqueueNotification(input);
    const second = await enqueueNotification(input);

    expect(first).toBe(true);
    expect(second).toBe(false);
    const count = await Notification.countDocuments({ order });
    expect(count).toBe(1);
  });

  it("10 encolados concurrentes del mismo (order, type) producen exactamente un documento", async () => {
    const order = orderId();
    const input = {
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order,
      payload: {},
    };

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => enqueueNotification(input)));

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const count = await Notification.countDocuments({ order });
    expect(count).toBe(1);
  });

  it("dos avisos de equipo sin order se crean ambos (el índice único es parcial)", async () => {
    const first = await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_ORDER_PAID,
      to: "team",
      payload: {},
    });
    const second = await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_ORDER_PAID,
      to: "team",
      payload: {},
    });

    expect(first).toBe(true);
    expect(second).toBe(true);
    const count = await Notification.countDocuments({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_ORDER_PAID,
    });
    expect(count).toBe(2);
  });
});

describe("notificationService · claimNextBatch", () => {
  it("reclama hasta el límite pedido, marcando sending y sumando un intento", async () => {
    for (let i = 0; i < 3; i += 1) {
      await enqueueNotification({
        channel: NotificationChannelKind.TEAM,
        type: NotificationType.TEAM_ORDER_PAID,
        to: "team",
        payload: { i },
      });
    }

    const claimed = await claimNextBatch(10);

    expect(claimed).toHaveLength(3);
    for (const doc of claimed) {
      expect(doc.status).toBe(NotificationStatus.SENDING);
      expect(doc.attempts).toBe(1);
    }
  });

  it("20 llamadas concurrentes sobre 1 pendiente reclaman exactamente una vez en total", async () => {
    await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_PAYMENT_FAILED,
      to: "team",
      payload: {},
    });

    const batches = await Promise.all(Array.from({ length: 20 }, () => claimNextBatch(1)));
    const totalClaimed = batches.reduce((sum, batch) => sum + batch.length, 0);

    expect(totalClaimed).toBe(1);
  });

  it("no reclama un pendiente cuya ventana está en el futuro", async () => {
    const order = orderId();
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order,
      payload: {},
    });
    await Notification.updateOne(
      { order },
      { $set: { nextAttemptAt: new Date(Date.now() + 60 * 60 * 1000) } },
    );

    const claimed = await claimNextBatch(10);

    expect(claimed.find((doc) => String(doc.order) === String(order))).toBeUndefined();
  });

  it("re-reclama un 'sending' huérfano (proceso muerto a media entrega)", async () => {
    const order = orderId();
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order,
      payload: {},
    });
    // timestamps:false here is test-only plumbing: Mongoose's timestamps
    // middleware overwrites an explicit updatedAt on every update, so this is
    // the only way to simulate a document that has been stuck since before.
    await Notification.updateOne(
      { order },
      {
        $set: {
          status: NotificationStatus.SENDING,
          updatedAt: new Date(Date.now() - 15 * 60 * 1000),
        },
      },
      { timestamps: false },
    );

    const claimed = await claimNextBatch(10);

    expect(claimed.find((doc) => String(doc.order) === String(order))).toBeDefined();
  });
});

describe("notificationService · markSent / markFailed", () => {
  it("markSent deja la notificación en sent con sentAt y purgeAt fijados", async () => {
    const order = orderId();
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order,
      payload: {},
    });
    const [doc] = await claimNextBatch(1);

    await markSent(doc!._id, "re_123");

    const after = await Notification.findById(doc!._id);
    expect(after?.status).toBe(NotificationStatus.SENT);
    expect(after?.sentAt).toBeInstanceOf(Date);
    expect(after?.purgeAt).toBeInstanceOf(Date);
  });

  it("markFailed con intentos restantes vuelve a pending con backoff y guarda el error", async () => {
    const order = orderId();
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order,
      payload: {},
    });
    const [doc] = await claimNextBatch(1);
    const beforeNextAttempt = doc!.nextAttemptAt.getTime();

    await markFailed(doc!, "502 Bad Gateway");

    const after = await Notification.findById(doc!._id);
    expect(after?.status).toBe(NotificationStatus.PENDING);
    expect(after?.nextAttemptAt.getTime()).toBeGreaterThan(beforeNextAttempt);
    expect(after?.lastError).toBe("502 Bad Gateway");
  });

  it("markFailed tras agotar los intentos queda failed y audita sin PII", async () => {
    const order = orderId();
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "clienta@example.com",
      order,
      payload: {},
    });
    let doc = (await claimNextBatch(1))[0]!;
    await Notification.updateOne({ _id: doc._id }, { $set: { attempts: 5 } });
    doc = (await Notification.findById(doc._id))!;

    await markFailed(doc, "502 Bad Gateway");

    const after = await Notification.findById(doc._id);
    expect(after?.status).toBe(NotificationStatus.FAILED);
    expect(after?.purgeAt).toBeInstanceOf(Date);

    const entry = await AuditLog.findOne({ action: AuditAction.NOTIFICATION_FAILED });
    expect(entry).not.toBeNull();
    expect(JSON.stringify(entry)).not.toContain("clienta@example.com");
  });
});
