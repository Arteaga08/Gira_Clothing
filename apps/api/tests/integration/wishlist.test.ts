import { describe, it, expect } from "vitest";
import request from "supertest";
import { WISHLIST_MAX_ITEMS } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Product } from "../../src/models/Product.js";
import { Print } from "../../src/models/Print.js";
import { Wishlist } from "../../src/models/Wishlist.js";
import { loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { seedVariant } from "../helpers/seedInventory.js";

const app = buildApp();
const BASE = "/api/v1/wishlist";

const save = (cookie: string, variantId: string) =>
  request(app).put(`${BASE}/${variantId}`).set("Origin", ORIGIN).set("Cookie", cookie);

describe("Wishlist · autorización", () => {
  it("GET, GET /ids, PUT y DELETE anónimos responden 401", async () => {
    const id = "507f1f77bcf86cd799439011";
    expect((await request(app).get(BASE)).status).toBe(401);
    expect((await request(app).get(`${BASE}/ids`)).status).toBe(401);
    expect((await request(app).put(`${BASE}/${id}`).set("Origin", ORIGIN)).status).toBe(401);
    expect((await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN)).status).toBe(401);
  });
});

describe("Wishlist · guardar y leer", () => {
  it("guarda una variante y la lista con precio vivo y sin cifras de stock", async () => {
    const { id } = await seedVariant({ tag: "wl1", onHand: 5 });
    const cookie = await loginAsCustomer(app);

    expect((await save(cookie, id)).status).toBe(200);

    const res = await request(app).get(BASE).set("Cookie", cookie);
    expect(res.status).toBe(200);
    const [item] = res.body.data.items;
    expect(res.body.data.items).toHaveLength(1);
    expect(item).toMatchObject({
      variantId: id,
      productName: "Modelo wl1",
      productSlug: "modelo-wl1",
      printName: "Print wl1",
      price: 30000,
      isAvailable: true,
    });
    expect(item).not.toHaveProperty("compareAtPrice");
    expect(item).not.toHaveProperty("onHand");
    expect(item).not.toHaveProperty("reserved");
  });

  it("guardar dos veces no duplica (idempotente)", async () => {
    const { id } = await seedVariant({ tag: "wl2", onHand: 1 });
    const cookie = await loginAsCustomer(app);

    expect((await save(cookie, id)).status).toBe(200);
    expect((await save(cookie, id)).status).toBe(200);

    const res = await request(app).get(`${BASE}/ids`).set("Cookie", cookie);
    expect(res.body.data.variantIds).toEqual([id]);
  });

  it("trae compareAtPrice mientras hay rebaja", async () => {
    const { id, productId } = await seedVariant({ tag: "wl3", onHand: 1 });
    await Product.updateOne({ _id: productId }, { $set: { salePrice: 20000 } });
    const cookie = await loginAsCustomer(app);
    await save(cookie, id);

    const res = await request(app).get(BASE).set("Cookie", cookie);
    expect(res.body.data.items[0]).toMatchObject({ price: 20000, compareAtPrice: 30000 });
  });

  it("un guardado agotado se queda con isAvailable=false", async () => {
    const { id } = await seedVariant({ tag: "wl4", onHand: 1 });
    const cookie = await loginAsCustomer(app);
    await save(cookie, id);
    await Variant.updateOne({ _id: id }, { $set: { onHand: 0 } });

    const res = await request(app).get(BASE).set("Cookie", cookie);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].isAvailable).toBe(false);
  });

  it("las cuentas no se ven entre sí", async () => {
    const { id } = await seedVariant({ tag: "wl5", onHand: 1 });
    const cookieA = await loginAsCustomer(app);
    const cookieB = await loginAsCustomer(app);
    await save(cookieA, id);

    const res = await request(app).get(BASE).set("Cookie", cookieB);
    expect(res.body.data.items).toEqual([]);
  });
});

describe("Wishlist · retirados", () => {
  it("no se puede guardar una variante inactiva", async () => {
    const { id } = await seedVariant({ tag: "wl6", isActive: false });
    const cookie = await loginAsCustomer(app);
    expect((await save(cookie, id)).status).toBe(404);
  });

  it("no se puede guardar si la estampa está retirada", async () => {
    const { id, printId } = await seedVariant({ tag: "wl7", onHand: 1 });
    await Print.updateOne({ _id: printId }, { $set: { isActive: false } });
    const cookie = await loginAsCustomer(app);
    expect((await save(cookie, id)).status).toBe(404);
  });

  it("un guardado retirado sale de la lista e ids, y vuelve si se reactiva", async () => {
    const { id, productId } = await seedVariant({ tag: "wl8", onHand: 1 });
    const cookie = await loginAsCustomer(app);
    await save(cookie, id);

    await Product.updateOne({ _id: productId }, { $set: { isActive: false } });
    const hidden = await request(app).get(BASE).set("Cookie", cookie);
    expect(hidden.body.data.items).toEqual([]);
    const hiddenIds = await request(app).get(`${BASE}/ids`).set("Cookie", cookie);
    expect(hiddenIds.body.data.variantIds).toEqual([]);

    await Product.updateOne({ _id: productId }, { $set: { isActive: true } });
    const back = await request(app).get(BASE).set("Cookie", cookie);
    expect(back.body.data.items).toHaveLength(1);
  });
});

describe("Wishlist · quitar y tope", () => {
  it("quitar es inmediato e idempotente", async () => {
    const { id } = await seedVariant({ tag: "wl9", onHand: 1 });
    const cookie = await loginAsCustomer(app);
    await save(cookie, id);

    const del = () => request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect((await del()).status).toBe(200);
    expect((await del()).status).toBe(200);

    const res = await request(app).get(BASE).set("Cookie", cookie);
    expect(res.body.data.items).toEqual([]);
  });

  it("rechaza el elemento 51 con 400, pero un repetido sigue siendo 200", async () => {
    const cookie = await loginAsCustomer(app);
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    const userId = (me.body.data.user.id ?? me.body.data.user._id) as string;
    const first = await seedVariant({ tag: "wlcap", onHand: 1 });
    const filler = Array.from({ length: WISHLIST_MAX_ITEMS - 1 }, () => ({
      user: userId,
      variant: new Variant()._id,
    }));
    await Wishlist.insertMany([{ user: userId, variant: first.id }, ...filler]);

    const extra = await seedVariant({ tag: "wlcap2", onHand: 1 });
    const over = await save(cookie, extra.id);
    expect(over.status).toBe(400);
    expect((await save(cookie, first.id)).status).toBe(200);
  });

  it("rechaza un identificador mal formado con 400", async () => {
    const cookie = await loginAsCustomer(app);
    expect((await save(cookie, "no-es-un-id")).status).toBe(400);
  });
});
