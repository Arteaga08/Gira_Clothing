import { describe, expect, it } from "vitest";
import request from "supertest";
import { OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Print } from "../../src/models/Print.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { User } from "../../src/models/User.js";
import { Variant } from "../../src/models/Variant.js";
import { resetDemo, seedDemo } from "../../src/scripts/demo/demoSeed.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();
const SMALL = { customerCount: 8, buyerCount: 6, orderCount: 40, days: 60 };

describe("seed:demo", () => {
  it("siembra catálogo, clientes y pedidos con historia", async () => {
    const summary = await seedDemo(SMALL);

    expect(summary).toMatchObject({ families: 4, categories: 4, prints: 16, products: 10, users: 8, orders: 40 });
    expect(await Variant.countDocuments()).toBe(summary.variants);
    const oldest = await Order.findOne().sort({ createdAt: 1 }).lean();
    expect(oldest!.createdAt.getTime()).toBeLessThan(Date.now() - 7 * 24 * 3_600_000);
  });

  it("los pedidos no despiertan a ningún job (sin pago pendiente, sin guía, efectos aplicados)", async () => {
    await seedDemo(SMALL);

    expect(await Order.countDocuments({ status: OrderStatus.PENDING_PAYMENT })).toBe(0);
    expect(await Order.countDocuments({ label: { $exists: true } })).toBe(0);
    expect(await Order.countDocuments({ paidAt: { $exists: true }, paidEffectsAt: { $exists: false } })).toBe(0);
    const statuses = await Order.distinct("status");
    expect(statuses).toEqual(expect.arrayContaining([OrderStatus.DELIVERED, OrderStatus.SHIPPED]));
  });

  it("un cliente demo puede iniciar sesión con la contraseña demo", async () => {
    await seedDemo(SMALL);
    const customer = await User.findOne({ role: "customer" }).lean();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: customer!.email, password: "GiraDemo2026" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("authenticated");
  });

  it("las pantallas del panel responden con los datos demo", async () => {
    await seedDemo(SMALL);
    const cookie = await loginAsAdmin(app);

    for (const path of [
      "/api/v1/admin/orders",
      "/api/v1/admin/stats/overview",
      "/api/v1/admin/customers/top?periodo=mes",
      "/api/v1/admin/customers",
      "/api/v1/admin/products",
      "/api/v1/admin/prints",
      "/api/v1/catalog/products",
      "/api/v1/catalog/prints",
    ]) {
      const res = await request(app).get(path).set("Cookie", cookie);
      expect(res.status, path).toBe(200);
    }
  });

  it("no siembra dos veces ni pisa datos existentes", async () => {
    await ProductCategory.create({ name: "Playeras", slug: "playeras" });

    await expect(seedDemo(SMALL)).rejects.toThrow(/categoría «playeras»/);
    expect(await Product.countDocuments()).toBe(0);
    expect(await resetDemo()).toBeNull();

    await ProductCategory.deleteMany({});
    await seedDemo(SMALL);
    await expect(seedDemo(SMALL)).rejects.toThrow(/--reset/);
  });

  it("--reset borra solo lo sembrado", async () => {
    const mine = await ProductCategory.create({ name: "Mía", slug: "mia" });
    const summary = await seedDemo(SMALL);

    const removed = await resetDemo();

    expect(removed).toEqual(summary);
    expect(await Order.countDocuments()).toBe(0);
    expect(await Print.countDocuments()).toBe(0);
    expect(await User.countDocuments({ role: "customer" })).toBe(0);
    expect(await ProductCategory.exists({ _id: mine._id })).not.toBeNull();
    await expect(seedDemo(SMALL)).resolves.toMatchObject({ orders: 40 });
  });
});
