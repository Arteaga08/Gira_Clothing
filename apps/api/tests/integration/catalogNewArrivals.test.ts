import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import { Print } from "../../src/models/Print.js";
import { PrintFamily } from "../../src/models/PrintFamily.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { Variant } from "../../src/models/Variant.js";

const app = buildApp();

const PRODUCTS = "/api/v1/admin/products";
const CATALOG_PRODUCTS = "/api/v1/catalog/products";

const seedPrint = async () => {
  const family = await PrintFamily.create({ name: "Flores", slug: "flores" });
  return Print.create({
    name: "Nopal",
    slug: "nopal",
    sku: "FLO-NOPAL",
    family: family._id,
    image: { url: "https://res.cloudinary.com/gira/image/upload/v1/nopal.jpg", publicId: "gira/nopal", width: 800, height: 600 },
  });
};

const seedProduct = (categoryId: unknown, name: string, extra: Record<string, unknown> = {}) =>
  Product.create({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), category: categoryId, basePrice: 30000, weightGrams: 300, ...extra });

describe("Producto · newArrival", () => {
  it("se guarda al crear y al editar, y queda apagado si no se envía", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await ProductCategory.create({ name: "Playeras", slug: "playeras" });
    const create = (body: Record<string, unknown>) =>
      request(app).post(PRODUCTS).set("Origin", ORIGIN).set("Cookie", cookie).send({ category: String(category._id), basePrice: 30000, weightGrams: 300, ...body });

    const plain = await create({ name: "Playera común" });
    expect(plain.body.data.product.newArrival).toBe(false);

    const flagged = await create({ name: "Playera nueva", newArrival: true });
    expect(flagged.status).toBe(201);
    expect(flagged.body.data.product.newArrival).toBe(true);

    const patched = await request(app)
      .patch(`${PRODUCTS}/${flagged.body.data.product.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ newArrival: false });
    expect(patched.body.data.product.newArrival).toBe(false);
  });

  it("rechaza un valor que no es booleano", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await ProductCategory.create({ name: "Playeras", slug: "playeras" });
    const product = await seedProduct(category._id, "Playera");
    const res = await request(app).patch(`${PRODUCTS}/${product._id}`).set("Origin", ORIGIN).set("Cookie", cookie).send({ newArrival: "quizá" });
    expect(res.status).toBe(400);
  });
});

describe("GET /catalog/products?newArrival=true", () => {
  it("devuelve solo los marcados y activos, del más nuevo al más viejo", async () => {
    const category = await ProductCategory.create({ name: "Playeras", slug: "playeras", color: "tangerine" });
    const print = await seedPrint();
    const older = await seedProduct(category._id, "Sudadera vieja", { newArrival: true, createdAt: new Date("2026-01-01") });
    const newer = await seedProduct(category._id, "Sudadera nueva", { newArrival: true, createdAt: new Date("2026-06-01") });
    const bestOnly = await seedProduct(category._id, "Más vendida", { bestSeller: true });
    const retired = await seedProduct(category._id, "Retirada", { newArrival: true, isActive: false });
    for (const [product, sku] of [[older, "V1"], [newer, "V2"], [bestOnly, "V3"], [retired, "V4"]] as const) {
      await Variant.create({ product: product._id, print: print._id, sku, images: [], onHand: 5, reserved: 0 });
    }

    const res = await request(app).get(`${CATALOG_PRODUCTS}?newArrival=true&sort=-createdAt`);
    expect(res.status).toBe(200);
    expect(res.body.data.products.map((p: { name: string }) => p.name)).toEqual(["Sudadera nueva", "Sudadera vieja"]);
    expect(res.body.data.products[0]).toMatchObject({ newArrival: true, bestSeller: false });
    expect(res.body.data.products[0].card).toBeDefined();
  });

  it("rechaza un filtro que no es booleano", async () => {
    const res = await request(app).get(`${CATALOG_PRODUCTS}?newArrival=quiza`);
    expect(res.status).toBe(400);
  });
});
