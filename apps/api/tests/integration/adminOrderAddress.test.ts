import { describe, it, expect } from "vitest";
import request from "supertest";
import { AuditAction, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const BASE = "/api/v1/admin/orders";

const newAddress = {
  recipient: "Luis Gómez",
  line1: "Av. Reforma 10",
  line2: "Piso 3",
  city: "CDMX",
  state: "CDMX",
  postalCode: "06600",
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
      expect((await Order.findById(id).lean())?.shipping.postalCode).toBe("06600");
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
