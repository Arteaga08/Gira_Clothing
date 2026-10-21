import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { Variant } from "../../src/models/Variant.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();
const FAMILIES_BASE = "/api/v1/admin/print-families";
const BASE = "/api/v1/admin/prints";

const image = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

const createFamily = async (cookie: string, name = "Florales") =>
  (
    await request(app).post(FAMILIES_BASE).set("Origin", ORIGIN).set("Cookie", cookie).send({ name })
  ).body.data.family.id as string;

const createPrint = (cookie: string, family: string, overrides: Record<string, unknown> = {}) =>
  request(app)
    .post(BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: "Rosas", sku: "FLR-001", family, image, ...overrides });

/** A model and one variant of `printId`, straight through the models. */
let seq = 0;
const seedUse = async (printId: string, name: string, isActive = true) => {
  seq += 1;
  const category =
    (await ProductCategory.findOne({ slug: "cat-dto" })) ??
    (await ProductCategory.create({ name: "Categoría dto", slug: "cat-dto" }));
  const product = await Product.create({
    name,
    slug: `modelo-dto-${seq}`,
    category: category._id,
    basePrice: 30000,
    weightGrams: 400,
  });
  await Variant.create({ product: product._id, print: printId, sku: `DTO-${seq}`, isActive });
  return String(product._id);
};

describe("Admin · Print · DTO de admin", () => {
  it("el listado trae conteos, modelos en uso (A-Z) y updatedAt", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const printId = (await createPrint(cookie, familyId)).body.data.print.id as string;
    await seedUse(printId, "Neceser");
    await seedUse(printId, "Cosmetiquera");
    await seedUse(printId, "Lonchera retirada", false);

    const res = await request(app).get(BASE).set("Cookie", cookie);
    const print = res.body.data.prints[0];
    expect(print).toMatchObject({ variantCount: 3, activeVariantCount: 2, family: { id: familyId, name: "Florales" } });
    expect(print.activeProducts.map((product: { name: string }) => product.name)).toEqual(["Cosmetiquera", "Neceser"]);
    expect(print.activeProducts[0].id).toEqual(expect.any(String));
    expect(typeof print.updatedAt).toBe("string");
  });

  it("una estampa sin variantes trae ceros y lista vacía", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    await createPrint(cookie, familyId);
    const print = (await request(app).get(BASE).set("Cookie", cookie)).body.data.prints[0];
    expect(print).toMatchObject({ variantCount: 0, activeVariantCount: 0, activeProducts: [] });
  });

  it("corta los modelos en uso a 10 sin perder el total de variantes activas", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const printId = (await createPrint(cookie, familyId)).body.data.print.id as string;
    for (let i = 0; i < 12; i += 1) await seedUse(printId, `Modelo ${String(i).padStart(2, "0")}`);
    const print = (await request(app).get(`${BASE}/${printId}`).set("Cookie", cookie)).body.data.print;
    expect(print.activeVariantCount).toBe(12);
    expect(print.activeProducts).toHaveLength(10);
    expect(print.activeProducts[0].name).toBe("Modelo 00");
  });

  it("ordena por sku, por actualización y cae a nombre con un campo no permitido", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    await createPrint(cookie, familyId, { name: "Beta", sku: "AAA-1" });
    await createPrint(cookie, familyId, { name: "Alfa", sku: "ZZZ-1" });
    const names = async (sort: string) =>
      (await request(app).get(`${BASE}?sort=${sort}`).set("Cookie", cookie)).body.data.prints.map(
        (print: { name: string }) => print.name,
      );
    expect(await names("sku")).toEqual(["Beta", "Alfa"]);
    expect(await names("-sku")).toEqual(["Alfa", "Beta"]);
    expect(await names("family")).toEqual(["Alfa", "Beta"]);
    expect(await names("-updatedAt")).toEqual(["Alfa", "Beta"]);
  });

  it("busca por nombre o SKU y filtra por estado", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    await createPrint(cookie, familyId, { name: "Margaritas", sku: "FLR-010" });
    const retired = await createPrint(cookie, familyId, { name: "Olas", sku: "GEO-010" });
    await request(app)
      .delete(`${BASE}/${retired.body.data.print.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);

    const bySku = await request(app).get(`${BASE}?search=geo-0`).set("Cookie", cookie);
    expect(bySku.body.data.prints.map((print: { name: string }) => print.name)).toEqual(["Olas"]);
    const active = await request(app).get(`${BASE}?isActive=true`).set("Cookie", cookie);
    expect(active.body.data.prints.map((print: { name: string }) => print.name)).toEqual(["Margaritas"]);
    expect(active.body.meta.total).toBe(1);
  });

  it("el detalle trae lo mismo y responde 404 si no existe", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const printId = (await createPrint(cookie, familyId)).body.data.print.id as string;
    await seedUse(printId, "Neceser");
    const res = await request(app).get(`${BASE}/${printId}`).set("Cookie", cookie);
    expect(res.body.data.print).toMatchObject({ variantCount: 1, activeVariantCount: 1 });
    const missing = await request(app).get(`${BASE}/64b7f0c2a1b2c3d4e5f60718`).set("Cookie", cookie);
    expect(missing.status).toBe(404);
  });

  it("crear, editar y retirar responden con el DTO de admin", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const created = await createPrint(cookie, familyId);
    expect(created.status).toBe(201);
    expect(created.body.data.print).toMatchObject({ variantCount: 0, activeProducts: [] });

    const id = created.body.data.print.id as string;
    const patched = await request(app)
      .patch(`${BASE}/${id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Rosas 2" });
    expect(patched.body.data.print).toMatchObject({ name: "Rosas 2", variantCount: 0 });

    const deleted = await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(deleted.body.data.print).toMatchObject({ isActive: false, activeVariantCount: 0 });
  });

  it("retirar con una variante activa responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const printId = (await createPrint(cookie, familyId)).body.data.print.id as string;
    await seedUse(printId, "Neceser");
    const res = await request(app).delete(`${BASE}/${printId}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/variantes activas/);
  });
});

describe("Admin · Print · SKU fijo", () => {
  it("PATCH con sku responde 400 y no lo cambia", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const id = (await createPrint(cookie, familyId)).body.data.print.id as string;
    const res = await request(app)
      .patch(`${BASE}/${id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ sku: "OTRO-1" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("El SKU no se puede cambiar.");
    const detail = await request(app).get(`${BASE}/${id}`).set("Cookie", cookie);
    expect(detail.body.data.print.sku).toBe("FLR-001");
  });

  it("al crear valida nombre y SKU", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    expect((await createPrint(cookie, familyId, { name: "R" })).status).toBe(400);
    expect((await createPrint(cookie, familyId, { sku: "fl r" })).status).toBe(400);
  });
});
