import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { AuditAction, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import {
  installFakeShippingProvider,
  restoreShippingProvider,
} from "../helpers/fakeShippingProvider.js";

const app = buildApp();
const BASE = "/api/v1/admin/orders";

const newAddress = {
  recipient: "Luis Gómez",
  line1: "Av. Reforma 10",
  line2: "Piso 3",
  district: "Condesa",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "01000",
  country: "MX",
};

const patchAddress = (cookie: string, id: unknown, body: Record<string, unknown>) =>
  request(app)
    .patch(`${BASE}/${String(id)}/shipping-address`)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send(body);

describe("PATCH /admin/orders/:id/shipping-address", () => {
  it.each([OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PROCESSING])(
    "corrige la dirección en %s",
    async (status) => {
      const cookie = await loginAsAdmin(app);
      const id = await seedOrder({ status, total: 1000, createdAt: new Date() });

      const res = await patchAddress(cookie, id, newAddress);

      expect(res.status).toBe(200);
      expect(res.body.data.order.shipping).toMatchObject({ recipient: "Luis Gómez", line1: "Av. Reforma 10" });
      expect((await Order.findById(id).lean())?.shipping.district).toBe("Condesa");
    },
  );

  it.each([
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.EXPIRED,
    OrderStatus.REFUNDED,
  ])("la dirección queda congelada en %s (409) y no se toca", async (status) => {
    const cookie = await loginAsAdmin(app);
    const id = await seedOrder({ status, total: 1000, createdAt: new Date() });

    const res = await patchAddress(cookie, id, newAddress);

    expect(res.status).toBe(409);
    expect((await Order.findById(id).lean())?.shipping.recipient).toBe("Ana Pérez");
  });

  it("404 si la orden no existe", async () => {
    const cookie = await loginAsAdmin(app);

    expect((await patchAddress(cookie, "507f1f77bcf86cd799439011", newAddress)).status).toBe(404);
  });

  it("400 si la dirección es inválida o incompleta, sin tocar la orden", async () => {
    const cookie = await loginAsAdmin(app);
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });

    expect((await patchAddress(cookie, id, { ...newAddress, country: "MEX" })).status).toBe(400);
    expect((await patchAddress(cookie, id, { recipient: "Solo nombre" })).status).toBe(400);
    expect((await Order.findById(id).lean())?.shipping.recipient).toBe("Ana Pérez");
  });

  it("ignora campos desconocidos (no se cuela nada más al documento)", async () => {
    const cookie = await loginAsAdmin(app);
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });

    const res = await patchAddress(cookie, id, { ...newAddress, total: 1, status: "shipped" });

    expect(res.status).toBe(200);
    const doc = await Order.findById(id).lean();
    expect(doc?.status).toBe(OrderStatus.PAID);
    expect(doc?.total).toBe(1000);
  });

  it("la auditoría registra la acción sin la dirección (PII)", async () => {
    const cookie = await loginAsAdmin(app);
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });

    await patchAddress(cookie, id, newAddress);

    const log = await AuditLog.findOne({ action: AuditAction.ORDER_SHIPPING_ADDRESS_UPDATED }).lean();
    expect(log?.targetId).toBe(String(id));
    expect(log?.before).toBeUndefined();
    expect(log?.after).toBeUndefined();
  });

  it("exige admin: 401 anónimo y 403 cliente", async () => {
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });

    const anonymous = await request(app)
      .patch(`${BASE}/${String(id)}/shipping-address`)
      .set("Origin", ORIGIN)
      .send(newAddress);
    expect(anonymous.status).toBe(401);
    expect((await patchAddress(await loginAsCustomer(app), id, newAddress)).status).toBe(403);
  });
});

describe("corrección de dirección · guía de envío", () => {
  afterEach(() => restoreShippingProvider());

  const paidWithLabel = async (cookie: string) => {
    const variantId = await seedCatalogVariant(app, cookie, "ADDRLBL", 50);
    const order = await createPendingOrder(variantId);
    await applyPaymentSucceeded(order._id);
    await settleLabelWork();
    return order;
  };

  it("con guía lista y mismo CP: cancela la guía vieja y compra una nueva", async () => {
    const cookie = await loginAsAdmin(app);
    const fake = installFakeShippingProvider();
    fake.createLabel
      .mockResolvedValueOnce({
        providerShipmentId: "s1", trackingNumber: "OLD111", carrier: "estafeta" as never,
        labelUrl: "https://stub.invalid/1.pdf", trackUrl: "https://stub.invalid/t1", costMxn: 12_000,
      })
      .mockResolvedValueOnce({
        providerShipmentId: "s2", trackingNumber: "NEW222", carrier: "estafeta" as never,
        labelUrl: "https://stub.invalid/2.pdf", trackUrl: "https://stub.invalid/t2", costMxn: 12_000,
      });
    const order = await paidWithLabel(cookie);
    expect((await Order.findById(order._id).lean())?.label?.trackingNumber).toBe("OLD111");

    const res = await patchAddress(cookie, order._id, newAddress);
    expect(res.status).toBe(200);
    await settleLabelWork();

    expect(fake.cancelLabel).toHaveBeenCalledWith(
      { carrier: "estafeta", trackingNumber: "OLD111" },
      expect.anything(),
    );
    const label = (await Order.findById(order._id).lean())?.label;
    expect(label?.status).toBe("ready");
    expect(label?.trackingNumber).toBe("NEW222");
  });

  it("con otro CP: 409 y la dirección no cambia", async () => {
    const cookie = await loginAsAdmin(app);
    const order = await paidWithLabel(cookie);
    const res = await patchAddress(cookie, order._id, { ...newAddress, postalCode: "06600" });
    expect(res.status).toBe(409);
    expect((await Order.findById(order._id).lean())?.shipping.postalCode).toBe("01000");
  });

  it("con una compra de guía en vuelo (requested): 409", async () => {
    const cookie = await loginAsAdmin(app);
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });
    await Order.updateOne(
      { _id: id },
      { $set: { label: { status: "requested", attempts: 1, cancelAttempts: 0, requestedAt: new Date() } } },
    );
    expect((await patchAddress(cookie, id, newAddress)).status).toBe(409);
  });

  it("exige colonia y un estado válido", async () => {
    const cookie = await loginAsAdmin(app);
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });
    expect((await patchAddress(cookie, id, { ...newAddress, district: undefined })).status).toBe(400);
    expect((await patchAddress(cookie, id, { ...newAddress, state: "CDMX" })).status).toBe(400);
  });
});
