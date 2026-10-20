import { beforeEach, afterEach, describe, it, expect } from "vitest";
import request from "supertest";
import {
  NotificationType,
  OrderStatus,
  ShipmentTrackingStatus as S,
  ShippingLabelStatus,
} from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { WebhookEvent } from "../../src/models/WebhookEvent.js";
import { ShipmentTrackingEvent } from "../../src/models/ShipmentTrackingEvent.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { resetRateLimitStores } from "../../src/middlewares/rateLimit.js";
import {
  installFakeShippingProvider,
  restoreShippingProvider,
  signedTrackingWebhook,
} from "../helpers/fakeShippingProvider.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
let variantId: string;

beforeEach(async () => {
  installFakeShippingProvider();
  variantId = await seedCatalogVariant(app, await loginAsAdmin(app), "WH", 200);
});
afterEach(restoreShippingProvider);

const processingOrder = async () => {
  const order = await createPendingOrder(variantId);
  await applyPaymentSucceeded(order._id);
  await settleLabelWork();
  await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PROCESSING } });
  const fresh = await Order.findById(order._id);
  if (fresh?.label?.status !== ShippingLabelStatus.READY) throw new Error("label not ready");
  return fresh;
};

const post = (w: { body: Buffer; headers: Record<string, string> }) => {
  const r = request(app).post("/api/webhooks/envia");
  for (const [k, v] of Object.entries(w.headers)) r.set(k, v);
  // A Buffer with a JSON content-type would be JSON-stringified by superagent; send the exact bytes as a string.
  return r.send(w.body.toString("utf8"));
};

describe("POST /api/webhooks/envia", () => {
  it("firmado y válido: 200, evento guardado, orden a shipped, un correo", async () => {
    const order = await processingOrder();
    const res = await post(
      signedTrackingWebhook({
        trackingNumber: order.label!.trackingNumber!,
        status: "picked_up",
        id: "d-1",
      }),
    );
    expect(res.status).toBe(200);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.SHIPPED);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
    expect(
      await Notification.countDocuments({ order: order._id, type: NotificationType.ORDER_SHIPPED }),
    ).toBe(1);
    const row = await WebhookEvent.findOne({ provider: "stub", eventId: "d-1" }).lean();
    expect(row?.status).toBe("processed");
  });

  it("redelivery con el mismo X-Webhook-Id: 200 'ya procesado' sin duplicar", async () => {
    const order = await processingOrder();
    const w = signedTrackingWebhook({
      trackingNumber: order.label!.trackingNumber!,
      status: "picked_up",
      id: "d-2",
    });
    await post(w);
    const again = await post(w);
    expect(again.status).toBe(200);
    expect(again.body.message).toMatch(/ya procesado/i);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
  });

  it("firma inválida o timestamp viejo: 400 y no toca nada", async () => {
    const order = await processingOrder();
    const bad = await post(
      signedTrackingWebhook({
        trackingNumber: order.label!.trackingNumber!,
        status: "delivered",
        secret: "otro",
      }),
    );
    expect(bad.status).toBe(400);
    const old = await post(
      signedTrackingWebhook({
        trackingNumber: order.label!.trackingNumber!,
        status: "delivered",
        timestamp: String(Date.now() - 3_600_000),
      }),
    );
    expect(old.status).toBe(400);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.PROCESSING);
  });

  it("sin cabeceras: 400", async () => {
    const res = await request(app)
      .post("/api/webhooks/envia")
      .set("content-type", "application/json")
      .send("{}");
    expect(res.status).toBe(400);
  });

  it("sin secreto configurado: 503", async () => {
    installFakeShippingProvider({ webhookSecret: null });
    const res = await post(signedTrackingWebhook({ trackingNumber: "X", status: "delivered" }));
    expect(res.status).toBe(503);
  });

  it("tipo de evento que no usamos: 200 y queda como ignored", async () => {
    const res = await post(
      signedTrackingWebhook({
        trackingNumber: "X",
        status: "delivered",
        id: "d-3",
        eventType: "surcharge",
      }),
    );
    expect(res.status).toBe(200);
    expect((await WebhookEvent.findOne({ provider: "stub", eventId: "d-3" }).lean())?.status).toBe(
      "ignored",
    );
  });

  it("guía desconocida: 200 (no se reintenta eternamente)", async () => {
    const res = await post(
      signedTrackingWebhook({ trackingNumber: "NADIE", status: S.DELIVERED, id: "d-4" }),
    );
    expect(res.status).toBe(200);
  });

  it("el efecto falla -> 500 y la redelivery lo reintenta", async () => {
    const order = await processingOrder();
    const original = Order.findOne.bind(Order);
    let boom = true;
    // First delivery: simulate a DB failure inside the effect, then recover.
    const spy = (await import("vitest")).vi.spyOn(Order, "findOne").mockImplementation(((
      ...args: Parameters<typeof Order.findOne>
    ) => {
      if (boom) {
        boom = false;
        throw new Error("db down");
      }
      return original(...args);
    }) as typeof Order.findOne);
    const w = signedTrackingWebhook({
      trackingNumber: order.label!.trackingNumber!,
      status: "picked_up",
      id: "d-5",
    });
    expect((await post(w)).status).toBe(500);
    spy.mockRestore();
    expect((await WebhookEvent.findOne({ provider: "stub", eventId: "d-5" }).lean())?.status).toBe(
      "failed",
    );
    expect((await post(w)).status).toBe(200);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.SHIPPED);
  });
});

describe("limiter propio del webhook de Envía", () => {
  afterEach(() => {
    process.env.RATE_LIMIT_ENABLED = "false";
  });

  it("expone su propio tope (1000) y no comparte bucket con Stripe", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
    const res = await request(app)
      .post("/api/webhooks/envia")
      .set("content-type", "application/json")
      .send("{}");
    expect(res.headers["ratelimit-limit"]).toBe("1000");
  });

  it("redelivery con otro X-Webhook-Id pero el mismo hecho: una fila y un correo", async () => {
    const order = await processingOrder();
    const createdAt = "2026-10-19T12:00:00.000Z";
    const mk = (id: string) =>
      signedTrackingWebhook({
        trackingNumber: order.label!.trackingNumber!,
        status: "picked_up",
        id,
        createdAt,
      });
    expect((await post(mk("d-a"))).status).toBe(200);
    expect((await post(mk("d-b"))).status).toBe(200);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
    expect(
      await Notification.countDocuments({ order: order._id, type: NotificationType.ORDER_SHIPPED }),
    ).toBe(1);
  });
});
