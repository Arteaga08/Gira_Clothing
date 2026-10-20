import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Print } from "../../src/models/Print.js";
import { PrintFamily } from "../../src/models/PrintFamily.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { Variant } from "../../src/models/Variant.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();
const BASE = "/api/v1/admin/products";

const img = (name: string) => ({
  url: `https://res.cloudinary.com/gira/image/upload/v1/${name}.jpg`,
  publicId: `gira/${name}`,
  width: 800,
  height: 600,
});

const get = (cookie: string, qs = "") => request(app).get(`${BASE}${qs}`).set("Cookie", cookie);

const seedCategory = (name: string) =>
  ProductCategory.create({ name, slug: `cat-${name.toLowerCase().replace(/\s+/g, "-")}` });

interface SeedProduct {
  name: string;
  categoryId: unknown;
  basePrice?: number;
  isActive?: boolean;
  sizeImage?: ReturnType<typeof img>;
}

const seedProduct = (input: SeedProduct) =>
  Product.create({
    name: input.name,
    slug: input.name.toLowerCase().replace(/\s+/g, "-"),
    category: input.categoryId,
    basePrice: input.basePrice ?? 20000,
    weightGrams: 300,
    isActive: input.isActive ?? true,
    ...(input.sizeImage ? { sizeImage: input.sizeImage } : {}),
  });

let printCounter = 0;
const seedVariant = async (
  productId: unknown,
  opts: { isActive?: boolean; images?: ReturnType<typeof img>[]; printName?: string } = {},
) => {
  printCounter += 1;
  const family = await PrintFamily.create({ name: `Familia ${printCounter}`, slug: `fam-${printCounter}` });
  const print = await Print.create({
    name: opts.printName ?? `Print ${printCounter}`,
    slug: `print-${printCounter}`,
    sku: `P-${printCounter}`,
    family: family._id,
    image: img(`print-${printCounter}`),
  });
  return Variant.create({
    product: productId,
    print: print._id,
    sku: `SKU-${printCounter}`,
    images: opts.images ?? [],
    isActive: opts.isActive ?? true,
  });
};

describe("GET /admin/products · forma AdminProduct", () => {
  it("resuelve la categoría, cuenta variantes y arma portada y estampas", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Cosmetiquera");
    const product = await seedProduct({ name: "Cosmetiquera chica", categoryId: category._id });
    await seedVariant(product._id, { printName: "Nopal" });
    await seedVariant(product._id, { printName: "Monarca", images: [img("foto-monarca"), img("otra")] });
    await seedVariant(product._id, { printName: "Retirada", isActive: false });

    const res = await get(cookie);
    expect(res.status).toBe(200);
    const row = res.body.data.products[0];
    expect(row).toMatchObject({
      id: String(product._id),
      name: "Cosmetiquera chica",
      category: { id: String(category._id), name: "Cosmetiquera" },
      variantCount: 3,
      activeVariantCount: 2,
      basePrice: 20000,
      isActive: true,
    });
    expect(row.cover.url).toContain("foto-monarca");
    expect(row.prints.map((p: { name: string }) => p.name)).toEqual(["Nopal", "Monarca"]);
    expect(row.prints[0].image.url).toContain("print-");
    expect(row.updatedAt).toBeTruthy();
    expect(row).not.toHaveProperty("sizeImage");
  });

  it("la portada cae a la imagen de la primera estampa activa", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Totes");
    const product = await seedProduct({ name: "Tote lona", categoryId: category._id });
    await seedVariant(product._id, { printName: "Solo print" });
    const row = (await get(cookie)).body.data.products[0];
    expect(row.cover.url).toContain("print-");
  });

  it("sin variantes activas la portada cae a la foto de tamaño", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Totes");
    await seedProduct({ name: "Tote vacío", categoryId: category._id, sizeImage: img("tamano") });
    const row = (await get(cookie)).body.data.products[0];
    expect(row.variantCount).toBe(0);
    expect(row.cover.url).toContain("tamano");
    expect(row.sizeImage.url).toContain("tamano");
    expect(row.prints).toEqual([]);
  });

  it("limita a 5 estampas en la tarjeta pero cuenta todas", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Playeras");
    const product = await seedProduct({ name: "Playera", categoryId: category._id });
    for (let i = 0; i < 6; i += 1) await seedVariant(product._id);
    const row = (await get(cookie)).body.data.products[0];
    expect(row.prints).toHaveLength(5);
    expect(row.variantCount).toBe(6);
  });
});

describe("GET /admin/products · orden, filtros y búsqueda", () => {
  it("por defecto ordena por categoría A-Z y luego por nombre", async () => {
    const cookie = await loginAsAdmin(app);
    const zeta = await seedCategory("Zeta");
    const alfa = await seedCategory("Alfa");
    await seedProduct({ name: "Beta", categoryId: zeta._id });
    await seedProduct({ name: "Dos", categoryId: alfa._id });
    await seedProduct({ name: "Uno", categoryId: alfa._id });
    const names = (await get(cookie)).body.data.products.map((p: { name: string }) => p.name);
    expect(names).toEqual(["Dos", "Uno", "Beta"]);
  });

  it("ordena por precio base descendente con sort=-basePrice", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Cat");
    await seedProduct({ name: "Barato", categoryId: category._id, basePrice: 10000 });
    await seedProduct({ name: "Caro", categoryId: category._id, basePrice: 90000 });
    const names = (await get(cookie, "?sort=-basePrice")).body.data.products.map(
      (p: { name: string }) => p.name,
    );
    expect(names).toEqual(["Caro", "Barato"]);
  });

  it("filtra por category e isActive, y busca por nombre sin tratar el texto como regex", async () => {
    const cookie = await loginAsAdmin(app);
    const a = await seedCategory("Cat A");
    const b = await seedCategory("Cat B");
    await seedProduct({ name: "Hoodie (II)", categoryId: a._id });
    await seedProduct({ name: "Gorra", categoryId: a._id, isActive: false });
    await seedProduct({ name: "Otra", categoryId: b._id });
    const byCategory = await get(cookie, `?category=${a._id}`);
    expect(byCategory.body.meta.total).toBe(2);
    const active = await get(cookie, `?category=${a._id}&isActive=true`);
    expect(active.body.data.products.map((p: { name: string }) => p.name)).toEqual(["Hoodie (II)"]);
    const search = await get(cookie, `?search=${encodeURIComponent("(II)")}`);
    expect(search.body.data.products).toHaveLength(1);
    expect((await get(cookie, `?search=${encodeURIComponent(".*")}`)).body.data.products).toEqual([]);
  });
});

describe("Mutaciones de producto responden AdminProduct", () => {
  it("POST, GET /:id, PATCH y DELETE traen categoría y resumen de variantes", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Bolsas");
    const created = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Tote", category: String(category._id), basePrice: 45000, weightGrams: 400 });
    expect(created.status).toBe(201);
    expect(created.body.data.product).toMatchObject({
      category: { name: "Bolsas" },
      variantCount: 0,
      activeVariantCount: 0,
      prints: [],
      materials: [],
      measurements: {},
    });
    const id = created.body.data.product.id as string;

    const detail = await get(cookie, `/${id}`);
    expect(detail.body.data.product.variantCount).toBe(0);

    const patched = await request(app)
      .patch(`${BASE}/${id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ basePrice: 50000 });
    expect(patched.body.data.product.basePrice).toBe(50000);

    const retired = await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(retired.body.data.product).toMatchObject({ isActive: false, variantCount: 0 });
  });

  it("GET /:id inexistente responde 404", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await get(cookie, "/64b7f3f3f3f3f3f3f3f3f3f3");
    expect(res.status).toBe(404);
  });
});
