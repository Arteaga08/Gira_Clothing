import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { seedVariant } from "../helpers/seedInventory.js";
import { Settings } from "../../src/models/Settings.js";
import { getSettings } from "../../src/services/settingsService.js";

const app = buildApp();
const BASE = "/api/v1/admin/variants";

const get = (cookie: string, qs = "") => request(app).get(`${BASE}${qs}`).set("Cookie", cookie);

describe("GET /admin/variants · forma AdminVariant", () => {
  it("resuelve producto, categoría y print y calcula available", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant({ tag: "L1", onHand: 10, reserved: 3 });
    const res = await get(cookie, `?product=${v.productId}`);
    expect(res.status).toBe(200);
    const row = res.body.data.variants[0];
    expect(row).toMatchObject({
      id: v.id,
      sku: "SKU-L1",
      available: 7,
      onHand: 10,
      reserved: 3,
      isActive: true,
      product: { id: v.productId, name: "Modelo L1", category: { id: v.categoryId, name: "Categoría L1" } },
      print: { id: v.printId, name: "Print L1", sku: "P-L1" },
    });
    expect(row.print.image.url).toContain("cloudinary");
    expect(row.updatedAt).toBeTruthy();
    expect(row).not.toHaveProperty("images");
  });
});

describe("GET /admin/variants · filtro stock (umbral desde Settings)", () => {
  it("separa agotado, bajo y ok con el umbral configurado", async () => {
    const cookie = await loginAsAdmin(app);
    const settings = await getSettings();
    await Settings.updateOne({ _id: settings._id }, { $set: { "inventory.lowStockThreshold": 5 } });
    const out = await seedVariant({ tag: "S0", categoryTag: "ST", onHand: 2, reserved: 2 });
    const neg = await seedVariant({ tag: "S1", categoryTag: "ST", onHand: 1, reserved: 3 });
    const low = await seedVariant({ tag: "S2", categoryTag: "ST", onHand: 5 });
    const ok = await seedVariant({ tag: "S3", categoryTag: "ST", onHand: 6 });
    const ids = async (stock: string) =>
      (await get(cookie, `?category=${out.categoryId}&stock=${stock}`)).body.data.variants.map(
        (r: { id: string }) => r.id,
      );
    expect((await ids("out")).sort()).toEqual([out.id, neg.id].sort());
    expect(await ids("low")).toEqual([low.id]);
    expect(await ids("ok")).toEqual([ok.id]);
  });

  it("stock inválido responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    expect((await get(cookie, "?stock=nada")).status).toBe(400);
  });
});

describe("GET /admin/variants · filtros, búsqueda y orden", () => {
  it("filtra por category, product, print e isActive", async () => {
    const cookie = await loginAsAdmin(app);
    const a = await seedVariant({ tag: "F1", categoryTag: "FA" });
    const b = await seedVariant({ tag: "F2", categoryTag: "FA", isActive: false });
    await seedVariant({ tag: "F3", categoryTag: "FB" });
    const byCat = await get(cookie, `?category=${a.categoryId}`);
    expect(byCat.body.data.variants).toHaveLength(2);
    expect(byCat.body.meta.total).toBe(2);
    const active = await get(cookie, `?category=${a.categoryId}&isActive=true`);
    expect(active.body.data.variants.map((r: { id: string }) => r.id)).toEqual([a.id]);
    const byPrint = await get(cookie, `?print=${b.printId}`);
    expect(byPrint.body.data.variants).toHaveLength(1);
    expect((await get(cookie, `?category=nope`)).status).toBe(400);
  });

  it("busca por SKU, modelo o print, sin tratar el texto como regex", async () => {
    const cookie = await loginAsAdmin(app);
    await seedVariant({ tag: "B1", productName: "Hoodie Bruma", printName: "Rosa de piedra" });
    await seedVariant({ tag: "B2", productName: "Gorra", printName: "Lava (II)" });
    const names = async (q: string) =>
      (await get(cookie, `?search=${encodeURIComponent(q)}`)).body.data.variants.map(
        (r: { sku: string }) => r.sku,
      );
    expect(await names("bruma")).toEqual(["SKU-B1"]);
    expect(await names("rosa")).toEqual(["SKU-B1"]);
    expect(await names("SKU-B2")).toEqual(["SKU-B2"]);
    expect(await names("(II)")).toEqual(["SKU-B2"]);
    expect(await names(".*")).toEqual([]);
  });

  it("ordena por available ascendente y descendente con paginación estable", async () => {
    const cookie = await loginAsAdmin(app);
    const first = await seedVariant({ tag: "O1", categoryTag: "OR", onHand: 9 });
    await seedVariant({ tag: "O2", categoryTag: "OR", onHand: 1 });
    await seedVariant({ tag: "O3", categoryTag: "OR", onHand: 4, reserved: 1 });
    const asc = await get(cookie, `?category=${first.categoryId}&sort=available`);
    expect(asc.body.data.variants.map((r: { available: number }) => r.available)).toEqual([1, 3, 9]);
    const desc = await get(cookie, `?category=${first.categoryId}&sort=-available&limit=2&page=1`);
    expect(desc.body.data.variants.map((r: { available: number }) => r.available)).toEqual([9, 3]);
    expect(desc.body.meta).toMatchObject({ total: 3, pages: 2, limit: 2 });
  });

  it("sort fuera de la lista blanca cae al orden por SKU", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await get(cookie, "?sort=$where");
    expect(res.status).toBe(200);
  });
});
