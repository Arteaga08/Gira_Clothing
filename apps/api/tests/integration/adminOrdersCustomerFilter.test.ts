import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { createCustomer, loginAsAdmin } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const oid = (id: string) => new mongoose.Types.ObjectId(id);

describe("GET /admin/orders?customer=", () => {
  it("devuelve solo los pedidos de ese cliente", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    const luis = await createCustomer({ email: "luis@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: new Date(), user: oid(ana.id) });
    await seedOrder({ status: OrderStatus.PAID, total: 20_000, createdAt: new Date(), user: oid(luis.id) });
    await seedOrder({ status: OrderStatus.PAID, total: 30_000, createdAt: new Date() });
    const res = await request(app).get(`/api/v1/admin/orders?customer=${ana.id}`).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.orders[0].user).toBe(ana.id);
  });

  it("400 si el id no es un ObjectId", async () => {
    const cookie = await loginAsAdmin(app);
    expect((await request(app).get("/api/v1/admin/orders?customer=zzz").set("cookie", cookie)).status).toBe(400);
  });
});
