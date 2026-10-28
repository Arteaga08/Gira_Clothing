import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import {
  Currency,
  NotificationChannelKind,
  NotificationStatus,
  NotificationType,
  OrderStatus,
} from "@gira/shared";
import { dispatchNotifications } from "../../src/jobs/dispatchNotifications.js";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { createOrderWithQuote as createOrder } from "../helpers/orders.js";
import {
  applyPaymentSucceeded,
  applyPaymentFailed,
  applyRefund,
} from "../../src/services/orderPaymentService.js";
import { ProviderEventType, type ProviderEvent } from "../../src/adapters/payment/index.js";
import { handleProviderEvent } from "../../src/services/webhookService.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";
const ADMIN_ORDERS_BASE = "/api/v1/admin/orders";

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};
const validShipping = {
  recipient: "Ana Pérez",
  line1: "Calle Falsa 123",
  district: "Juárez",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "01000",
  country: "MX",
};
const validCustomer = { email: "cliente@example.com", name: "Ana Pérez", phone: "5512345678" };
const uniqueKey = (): string => `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const seedVariant = async (adminCookie: string, suffix: string, onHand = 10): Promise<string> => {
  const familyRes = await request(app)
    .post(FAMILIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Familia ${suffix}` });
  const familyId = familyRes.body.data.family.id as string;

  const printRes = await request(app)
    .post(PRINTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Print ${suffix}`, sku: `SKU-${suffix}`, family: familyId, image: validImage });
  const printId = printRes.body.data.print.id as string;

  const categoryRes = await request(app)
    .post(CATEGORIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Categoría ${suffix}` });
  const categoryId = categoryRes.body.data.category.id as string;

  const productRes = await request(app)
    .post(PRODUCTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 10000, weightGrams: 400 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ product: productId, print: printId, images: [validImage] });
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne({ _id: variantId }, { $set: { onHand } });
  return variantId;
};

const seedOrder = async (adminCookie: string, suffix: string): Promise<OrderDocument> => {
  const variantId = await seedVariant(adminCookie, suffix, 10);
  const result = await createOrder(
    {
      lines: [{ variantId, qty: 1 }],
      currency: Currency.MXN,
      customer: validCustomer,
      shipping: validShipping,
      idempotencyKey: uniqueKey(),
    },
    {},
  );
  const order = await Order.findOne({ publicId: result.order.publicId });
  return order!;
};

describe("orderPaymentService · notificaciones", () => {
  it("applyPaymentSucceeded encola la confirmación a la clienta", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N1");

    await applyPaymentSucceeded(order._id);

    const doc = await Notification.findOne({
      order: order._id,
      type: NotificationType.ORDER_CONFIRMATION,
    });
    expect(doc).not.toBeNull();
    expect(doc?.channel).toBe(NotificationChannelKind.EMAIL);
    expect(doc?.to).toBe(order.customer.email);
    expect((doc?.payload as { total: number }).total).toBe(order.total);
    // The email shows the folio and keeps the credential only for the link.
    expect((doc?.payload as { orderNumber: string }).orderNumber).toBe(order.orderNumber);
    expect((doc?.payload as { publicId: string }).publicId).toBe(order.publicId);
  });

  it("applyPaymentSucceeded encola un aviso de equipo sin el correo de la clienta", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N2");

    await applyPaymentSucceeded(order._id);

    const doc = await Notification.findOne({ type: NotificationType.TEAM_ORDER_PAID });
    expect(doc).not.toBeNull();
    expect(doc?.channel).toBe(NotificationChannelKind.TEAM);
    const payload = doc?.payload as { orderNumber: string };
    expect(payload.orderNumber).toBe(order.orderNumber);
    // Telegram is a shared channel: the order's credential never travels there.
    expect(JSON.stringify(doc?.payload)).not.toContain(order.publicId);
    expect(JSON.stringify(doc?.payload)).not.toContain(order.customer.email);
  });

  it("llamar applyPaymentSucceeded dos veces solo encola una notificación de cada tipo", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N3");

    await applyPaymentSucceeded(order._id);
    await applyPaymentSucceeded(order._id);

    expect(
      await Notification.countDocuments({ order: order._id, type: NotificationType.ORDER_CONFIRMATION }),
    ).toBe(1);
    expect(await Notification.countDocuments({ type: NotificationType.TEAM_ORDER_PAID })).toBe(1);
  });

  it("dos entregas del mismo evento de webhook solo encolan una confirmación", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N4");

    const event: ProviderEvent = {
      id: `evt_${uniqueKey()}`,
      type: ProviderEventType.PAYMENT_SUCCEEDED,
      orderId: String(order._id),
      raw: {},
    };

    await handleProviderEvent(event);
    await handleProviderEvent(event);

    expect(
      await Notification.countDocuments({ order: order._id, type: NotificationType.ORDER_CONFIRMATION }),
    ).toBe(1);
  });

  it("applyPaymentFailed encola un aviso de equipo y un solo correo a la clienta por orden", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N5");

    await applyPaymentFailed(order._id, "card_declined");
    await applyPaymentFailed(order._id, "insufficient_funds");

    const teamDoc = await Notification.findOne({ type: NotificationType.TEAM_PAYMENT_FAILED });
    expect(teamDoc).not.toBeNull();
    const emails = await Notification.find({ channel: NotificationChannelKind.EMAIL, order: order._id }).lean();
    expect(emails).toHaveLength(1);
    expect(emails[0]?.type).toBe(NotificationType.ORDER_PAYMENT_FAILED);
    expect(emails[0]?.to).toBe(order.customer.email);
    expect((emails[0]?.payload as { orderNumber: string }).orderNumber).toBe(order.orderNumber);
  });

  it("el aviso de pago fallido espera unos minutos y se omite si la orden se pagó mientras tanto", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N9");

    await applyPaymentFailed(order._id, "card_declined");
    const queued = await Notification.findOne({ order: order._id, type: NotificationType.ORDER_PAYMENT_FAILED });
    // Retrying with another card usually takes less than this.
    expect(queued!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 5 * 60 * 1000);

    await applyPaymentSucceeded(order._id);
    await Notification.updateOne({ _id: queued!._id }, { $set: { nextAttemptAt: new Date(0) } });
    await dispatchNotifications();

    expect((await Notification.findById(queued!._id))!.status).toBe(NotificationStatus.SKIPPED);
  });

  it("si la orden sigue por pagar, el aviso de pago fallido sí se envía", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N10");

    await applyPaymentFailed(order._id, "card_declined");
    await Notification.updateOne(
      { order: order._id, type: NotificationType.ORDER_PAYMENT_FAILED },
      { $set: { nextAttemptAt: new Date(0) } },
    );
    await dispatchNotifications();

    const doc = await Notification.findOne({ order: order._id, type: NotificationType.ORDER_PAYMENT_FAILED });
    expect(doc!.status).toBe(NotificationStatus.SENT);
  });

  it("un reembolso total de una orden pagada encola la confirmación con el monto", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N7");
    await applyPaymentSucceeded(order._id);

    await applyRefund(order._id, order.total);
    await applyRefund(order._id, order.total);

    const docs = await Notification.find({ order: order._id, type: NotificationType.ORDER_REFUNDED }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.to).toBe(order.customer.email);
    expect((docs[0]?.payload as { refundedAmount: number }).refundedAmount).toBe(order.total);
  });

  it("un reembolso parcial no manda correo a la clienta", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N8");
    await applyPaymentSucceeded(order._id);

    await applyRefund(order._id, 100);

    expect(await Notification.countDocuments({ order: order._id, type: NotificationType.ORDER_REFUNDED })).toBe(0);
  });

  it("un fallo al encolar deja la orden en paid pero propaga el error; el reintento completa los avisos", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N6");
    const spy = vi.spyOn(Notification, "create").mockRejectedValue(new Error("db down"));

    try {
      // Strict enqueue: a lost confirmation must fail the webhook so Stripe retries.
      await expect(applyPaymentSucceeded(order._id)).rejects.toThrow("db down");
    } finally {
      spy.mockRestore();
    }
    expect((await Order.findById(order._id))?.status).toBe(OrderStatus.PAID);
    expect(await Notification.countDocuments({ order: order._id })).toBe(0);

    // The retry finds the order already paid and still finishes the job.
    await applyPaymentSucceeded(order._id);
    expect(
      await Notification.countDocuments({ order: order._id, type: NotificationType.ORDER_CONFIRMATION }),
    ).toBe(1);
    expect(
      await Notification.countDocuments({ order: order._id, type: NotificationType.TEAM_ORDER_PAID }),
    ).toBe(1);
  });
});

describe("adminOrderService · notificaciones", () => {
  it("pasar a processing encola el correo de preparación", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N7");
    await applyPaymentSucceeded(order._id);

    await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "processing" });

    const doc = await Notification.findOne({
      order: order._id,
      type: NotificationType.ORDER_PREPARING,
    });
    expect(doc).not.toBeNull();
  });

  it("pasar a shipped o delivered vía adminOrderService no encola nada (no es su responsabilidad)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N8");
    await applyPaymentSucceeded(order._id);
    await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "processing" });

    const before = await Notification.countDocuments({ order: order._id });

    await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "shipped" });
    await request(app)
      .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminCookie)
      .send({ status: "delivered" });

    const after = await Notification.countDocuments({ order: order._id });
    expect(after).toBe(before);
  });
});
