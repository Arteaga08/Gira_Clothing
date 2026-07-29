import { describe, it, expect } from "vitest";
import request from "supertest";
import { Currency, NotificationType, OrderStatus, ShipmentStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { Notification } from "../../src/models/Notification.js";
import { createOrder } from "../../src/services/orderService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { changeOrderStatus } from "../../src/services/adminOrderService.js";
import {
  createShipment,
  addShipmentEvent,
  getAdminShipment,
  getPublicTracking,
} from "../../src/services/shipmentService.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";

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

/** Fast-forwards a freshly created order straight to `processing`. */
const seedProcessingOrder = async (adminCookie: string, suffix: string): Promise<OrderDocument> => {
  const order = await seedOrder(adminCookie, suffix);
  await applyPaymentSucceeded(order._id);
  await changeOrderStatus(String(order._id), OrderStatus.PROCESSING, {});
  return (await Order.findById(order._id))!;
};

describe("shipmentService · createShipment", () => {
  it("crea el envío in_transit, mueve la orden a shipped y audita", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "S1");

    const shipment = await createShipment(
      String(order._id),
      { carrier: "Estafeta", trackingNumber: "1234567890" },
      {},
    );

    expect(shipment.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(shipment.events).toHaveLength(1);

    const after = await Order.findById(order._id);
    expect(after?.status).toBe(OrderStatus.SHIPPED);

    const entry = await AuditLog.findOne({ targetId: order.publicId, action: "shipment_created" });
    expect(entry).not.toBeNull();
  });

  it("encola el correo de guía con la paquetería y el número de guía", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "S2");

    await createShipment(String(order._id), { carrier: "Estafeta", trackingNumber: "1234567890" }, {});

    const doc = await Notification.findOne({ order: order._id, type: NotificationType.ORDER_SHIPPED });
    expect(doc).not.toBeNull();
    const payload = doc?.payload as { carrier: string; trackingNumber: string };
    expect(payload.carrier).toBe("Estafeta");
    expect(payload.trackingNumber).toBe("1234567890");
  });

  it("rechaza crear un envío sobre una orden que no está en processing", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "S3");
    await applyPaymentSucceeded(order._id); // queda en "paid", no "processing"

    await expect(
      createShipment(String(order._id), { carrier: "Estafeta", trackingNumber: "1" }, {}),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(await getAdminShipment(String(order._id)).catch((err: { statusCode: number }) => err))
      .toMatchObject({ statusCode: 404 });
  });

  it("rechaza un segundo envío para la misma orden", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "S4");
    await createShipment(String(order._id), { carrier: "Estafeta", trackingNumber: "1" }, {});

    await expect(
      createShipment(String(order._id), { carrier: "DHL", trackingNumber: "2" }, {}),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("responde 404 sobre una orden inexistente", async () => {
    await expect(
      createShipment("507f1f77bcf86cd799439011", { carrier: "Estafeta", trackingNumber: "1" }, {}),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("shipmentService · addShipmentEvent", () => {
  it("marcar delivered agrega el evento y mueve la orden a delivered", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "S5");
    await createShipment(String(order._id), { carrier: "Estafeta", trackingNumber: "1" }, {});

    const shipment = await addShipmentEvent(
      String(order._id),
      { status: ShipmentStatus.DELIVERED },
      {},
    );

    expect(shipment.status).toBe(ShipmentStatus.DELIVERED);
    expect(shipment.events).toHaveLength(2);
    const after = await Order.findById(order._id);
    expect(after?.status).toBe(OrderStatus.DELIVERED);
  });

  it("un estado intermedio avanza el envío y la orden sigue en shipped", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "S6");
    await createShipment(String(order._id), { carrier: "Estafeta", trackingNumber: "1" }, {});

    const shipment = await addShipmentEvent(
      String(order._id),
      { status: ShipmentStatus.OUT_FOR_DELIVERY },
      {},
    );

    expect(shipment.status).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    const after = await Order.findById(order._id);
    expect(after?.status).toBe(OrderStatus.SHIPPED);
  });

  it("rechaza una transición inválida sin agregar un evento nuevo", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "S7");
    await createShipment(String(order._id), { carrier: "Estafeta", trackingNumber: "1" }, {});
    await addShipmentEvent(String(order._id), { status: ShipmentStatus.DELIVERED }, {});

    await expect(
      addShipmentEvent(String(order._id), { status: ShipmentStatus.IN_TRANSIT }, {}),
    ).rejects.toMatchObject({ statusCode: 409 });

    const shipment = await getAdminShipment(String(order._id));
    expect(shipment.events).toHaveLength(2);
  });

  it("una incidencia (returned) no mueve la orden y encola un aviso al equipo", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "S8");
    await createShipment(String(order._id), { carrier: "Estafeta", trackingNumber: "1" }, {});

    await addShipmentEvent(String(order._id), { status: ShipmentStatus.RETURNED }, {});

    const after = await Order.findById(order._id);
    expect(after?.status).toBe(OrderStatus.SHIPPED);
    const incident = await Notification.findOne({ type: NotificationType.TEAM_SHIPMENT_INCIDENT });
    expect(incident).not.toBeNull();
  });
});

describe("shipmentService · getPublicTracking", () => {
  it("expone estado, paquetería, guía y eventos sin datos internos", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedProcessingOrder(adminCookie, "S9");
    await createShipment(String(order._id), { carrier: "Estafeta", trackingNumber: "1234567890" }, {});

    const tracking = await getPublicTracking(order.publicId);

    expect(tracking.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(tracking.carrier).toBe("Estafeta");
    expect(tracking.trackingNumber).toBe("1234567890");
    expect(tracking.events).toHaveLength(1);
    const serialized = JSON.stringify(tracking);
    expect(serialized).not.toContain("_id");
    expect(serialized).not.toContain(order.customer.email);
    expect(serialized).not.toContain(String(order._id));
  });

  it("responde 404 cuando la orden existe pero no tiene envío", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "S10");

    await expect(getPublicTracking(order.publicId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("responde el mismo 404 cuando el publicId no existe", async () => {
    await expect(getPublicTracking("no-existe-este-id")).rejects.toMatchObject({ statusCode: 404 });
  });
});
