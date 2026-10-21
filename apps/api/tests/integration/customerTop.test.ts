import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { Currency, DisputeStatus, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { createCustomer, loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const URL = "/api/v1/admin/customers/top";
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const DAYS = 86_400_000;
const now = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * DAYS);

const get = async (query = "") => {
  const cookie = await loginAsAdmin(app);
  return request(app).get(`${URL}${query}`).set("cookie", cookie);
};

describe("GET /admin/customers/top", () => {
  it("401 sin sesión y 403 a un cliente", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(URL).set("cookie", cookie)).status).toBe(403);
  });

  it("400 con periodo u orden inválidos", async () => {
    expect((await get("?period=year")).status).toBe(400);
    expect((await get("?sortBy=nope")).status).toBe(400);
  });

  it("ordena por gasto neto por defecto, con compras como desempate", async () => {
    const a = await createCustomer({ email: "a@example.com" });
    const b = await createCustomer({ email: "b@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 50_000, createdAt: now(), user: oid(a.id) });
    await seedOrder({ status: OrderStatus.DELIVERED, total: 30_000, createdAt: now(), user: oid(b.id) });
    await seedOrder({ status: OrderStatus.DELIVERED, total: 30_000, createdAt: now(), user: oid(b.id) });
    const res = await get();
    expect(res.status).toBe(200);
    const rows = res.body.data.ranking.rows;
    expect(rows.map((r: { email: string }) => r.email)).toEqual(["b@example.com", "a@example.com"]);
    expect(rows[0]).toMatchObject({ orderCount: 2, spentMxn: 60_000 });
    expect(res.body.data.ranking).toMatchObject({ period: "month", sortBy: "spent" });
  });

  it("sortBy=orders ordena por número de compras", async () => {
    const a = await createCustomer({ email: "a@example.com" });
    const b = await createCustomer({ email: "b@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 90_000, createdAt: now(), user: oid(a.id) });
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now(), user: oid(b.id) });
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now(), user: oid(b.id) });
    const rows = (await get("?sortBy=orders")).body.data.ranking.rows;
    expect(rows[0].email).toBe("b@example.com");
  });

  it("solo cuentan pedidos pagados (no pendientes, cancelados, reembolsados) ni disputa perdida", async () => {
    const c = await createCustomer();
    for (const status of [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.REFUNDED]) {
      await seedOrder({ status, total: 10_000, createdAt: now(), user: oid(c.id) });
    }
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now(), user: oid(c.id), disputeStatus: DisputeStatus.LOST });
    expect((await get()).body.data.ranking.rows).toEqual([]);
  });

  it("descuenta el reembolso parcial", async () => {
    const c = await createCustomer();
    await seedOrder({ status: OrderStatus.PAID, total: 50_000, createdAt: now(), user: oid(c.id), refundedAmount: 20_000 });
    expect((await get()).body.data.ranking.rows[0]).toMatchObject({ spentMxn: 30_000 });
  });

  it("convierte un pedido en USD con su propia tasa", async () => {
    const c = await createCustomer();
    // 1_000 US cents at 18.50 MXN/USD (exchangeRate 1850) = 18_500 MXN centavos
    await seedOrder({ status: OrderStatus.PAID, total: 1_000, currency: Currency.USD, exchangeRate: 1_850, createdAt: now(), user: oid(c.id) });
    expect((await get()).body.data.ranking.rows[0].spentMxn).toBe(18_500);
  });

  it("ignora invitados y respeta el periodo", async () => {
    const c = await createCustomer();
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now() }); // guest: no user
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: daysAgo(40), user: oid(c.id) }); // out of month
    expect((await get("?period=month")).body.data.ranking.rows).toEqual([]);
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now(), user: oid(c.id) });
    expect((await get("?period=today")).body.data.ranking.rows).toHaveLength(1);
  });

  it("devuelve como máximo 10 filas y no expone datos sensibles", async () => {
    for (let i = 0; i < 12; i++) {
      const c = await createCustomer({ email: `c${i}@example.com` });
      await seedOrder({ status: OrderStatus.PAID, total: 10_000 + i, createdAt: now(), user: oid(c.id) });
    }
    const rows = (await get()).body.data.ranking.rows;
    expect(rows).toHaveLength(10);
    expect(Object.keys(rows[0]).sort()).toEqual(["email", "firstName", "id", "lastName", "orderCount", "spentMxn"]);
  });
});
