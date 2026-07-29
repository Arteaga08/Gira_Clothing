import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Currency, NotificationChannelKind, NotificationType, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { createOrder } from "../../src/services/orderService.js";
import { applyPaymentSucceeded, applyPaymentFailed } from "../../src/services/orderPaymentService.js";
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
  city: "CDMX",
  state: "CDMX",
  postalCode: "01000",
  country: "MX",
};
const validCustomer = { email: "cliente@example.com", name: "Ana Pérez" };
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 10000 });
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
  });

  it("applyPaymentSucceeded encola un aviso de equipo sin el correo de la clienta", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N2");

    await applyPaymentSucceeded(order._id);

    const doc = await Notification.findOne({ type: NotificationType.TEAM_ORDER_PAID });
    expect(doc).not.toBeNull();
    expect(doc?.channel).toBe(NotificationChannelKind.TEAM);
    expect((doc?.payload as { publicId: string }).publicId).toBe(order.publicId);
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

  it("applyPaymentFailed encola un aviso de equipo y ningún correo a la clienta", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N5");

    await applyPaymentFailed(order._id, "card_declined");

    const teamDoc = await Notification.findOne({ type: NotificationType.TEAM_PAYMENT_FAILED });
    expect(teamDoc).not.toBeNull();
    expect(
      await Notification.countDocuments({ channel: NotificationChannelKind.EMAIL, order: order._id }),
    ).toBe(0);
  });

  it("un fallo al encolar no impide que la orden quede en paid", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "N6");
    vi.spyOn(Notification, "create").mockRejectedValue(new Error("db down"));

    await applyPaymentSucceeded(order._id);

    const after = await Order.findById(order._id);
    expect(after?.status).toBe(OrderStatus.PAID);
    vi.restoreAllMocks();
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
