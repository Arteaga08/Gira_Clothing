import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { OrderStatus, UserRole } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { createCustomer, loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const BASE = "/api/v1/admin/customers";
const oid = (id: string) => new mongoose.Types.ObjectId(id);

describe("GET /admin/customers", () => {
  it("401 / 403", async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(BASE).set("cookie", cookie)).status).toBe(403);
  });

  it("lista solo clientes (no admins) con sus métricas históricas", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    await createCustomer({ email: "sin-compras@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 40_000, createdAt: new Date("2026-01-10"), user: oid(ana.id) });
    await seedOrder({ status: OrderStatus.DELIVERED, total: 20_000, createdAt: new Date("2026-02-10"), user: oid(ana.id), refundedAmount: 5_000 });
    await seedOrder({ status: OrderStatus.CANCELLED, total: 99_000, createdAt: new Date("2026-03-10"), user: oid(ana.id) });
    const res = await request(app).get(`${BASE}?limit=10`).set("cookie", cookie);
    expect(res.status).toBe(200);
    const customers = res.body.data.customers as { email: string; stats: Record<string, unknown> }[];
    expect(customers.some((c) => c.email.startsWith("admin"))).toBe(false);
    const row = customers.find((c) => c.email === "ana@example.com")!;
    expect(row.stats).toMatchObject({ orderCount: 2, spentMxn: 55_000 });
    expect(new Date(row.stats.lastOrderAt as string).toISOString()).toBe(new Date("2026-02-10").toISOString());
    const empty = customers.find((c) => c.email === "sin-compras@example.com")!;
    expect(empty.stats).toEqual({ orderCount: 0, spentMxn: 0, lastOrderAt: null });
    expect(row).not.toHaveProperty("password");
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10 });
  });

  it("busca por nombre o correo", async () => {
    const cookie = await loginAsAdmin(app);
    await User.create({ firstName: "Mariana", lastName: "Ocampo", email: "mariana@example.com", password: "Clave12345", role: UserRole.CUSTOMER });
    await createCustomer({ email: "otro@example.com" });
    const res = await request(app).get(`${BASE}?search=mariana`).set("cookie", cookie);
    expect(res.body.data.customers.map((c: { email: string }) => c.email)).toEqual(["mariana@example.com"]);
  });
});

describe("GET /admin/customers/:id", () => {
  it("devuelve la ficha con métricas", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 40_000, createdAt: new Date(), user: oid(ana.id) });
    const res = await request(app).get(`${BASE}/${ana.id}`).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.customer).toMatchObject({ id: ana.id, email: "ana@example.com", stats: { orderCount: 1, spentMxn: 40_000 } });
  });

  it("404 para un id inexistente o de un admin, 400 para un id mal formado", async () => {
    const cookie = await loginAsAdmin(app);
    const admin = await User.findOne({ role: UserRole.ADMIN });
    expect((await request(app).get(`${BASE}/${new mongoose.Types.ObjectId()}`).set("cookie", cookie)).status).toBe(404);
    expect((await request(app).get(`${BASE}/${admin!.id}`).set("cookie", cookie)).status).toBe(404);
    expect((await request(app).get(`${BASE}/zzz`).set("cookie", cookie)).status).toBe(400);
  });
});
