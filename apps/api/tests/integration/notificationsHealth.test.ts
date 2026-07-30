import { describe, it, expect } from "vitest";
import request from "supertest";
import { NotificationChannelKind, NotificationType, NotificationStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Notification } from "../../src/models/Notification.js";
import { loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app = buildApp();
const URL = "/api/v1/admin/notifications/health";

describe("GET /admin/notifications/health", () => {
  it("rechaza sin sesión", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("rechaza a un customer", async () => {
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(URL).set("cookie", cookie)).status).toBe(403);
  });

  it("base vacía devuelve ceros y oldestPendingAt null", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(URL).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        pending: 0,
        sending: 0,
        failed: 0,
        sent: 0,
        stale: 0,
        oldestPendingAt: null,
        failedSample: [],
      }),
    );
  });

  it("cuenta por estado y calcula oldestPendingAt", async () => {
    const cookie = await loginAsAdmin(app);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    await Notification.create({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "cliente@example.com",
      payload: { name: "Ana" },
      status: NotificationStatus.PENDING,
      nextAttemptAt: old,
    });
    await Notification.create({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_SHIPPED,
      to: "otro@example.com",
      payload: { name: "Luis" },
      status: NotificationStatus.FAILED,
      attempts: 5,
      lastError: "Recipient address rejected",
    });

    const res = await request(app).get(URL).set("cookie", cookie);
    expect(res.body.data.pending).toBe(1);
    expect(res.body.data.failed).toBe(1);
    expect(new Date(res.body.data.oldestPendingAt).getTime()).toBe(old.getTime());
  });

  it("failedSample omite `to` y `payload`, e incluye lastError truncado", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(URL).set("cookie", cookie);
    for (const sample of res.body.data.failedSample) {
      expect(sample).not.toHaveProperty("to");
      expect(sample).not.toHaveProperty("payload");
      expect(sample).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          channel: expect.any(String),
          type: expect.any(String),
          attempts: expect.any(Number),
        }),
      );
    }
  });
});
