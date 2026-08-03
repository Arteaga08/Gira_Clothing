import { describe, it, expect } from "vitest";
import request from "supertest";
import { Variant } from "../../src/models/Variant.js";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const STATS_URL = "/api/v1/admin/variants/stats";
const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

/** Creates one variant via the real admin flow, then patches raw stock fields. */
const seedVariant = async (
  adminCookie: string,
  suffix: string,
  stock: { onHand: number; reserved?: number; isActive?: boolean },
): Promise<string> => {
  const familyRes = await request(app)
    .post(FAMILIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Familia ${suffix}` });
  const familyId = familyRes.body.data.family.id as string;

  const printRes = await request(app)
    .post(PRINTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Print ${suffix}`, sku: `SKU-${suffix}`, family: familyId, image: validImage });
  const printId = printRes.body.data.print.id as string;

  const categoryRes = await request(app)
    .post(CATEGORIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Categoría ${suffix}` });
  const categoryId = categoryRes.body.data.category.id as string;

  const productRes = await request(app)
    .post(PRODUCTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 10000 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ product: productId, print: printId, images: [validImage] });
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne(
    { _id: variantId },
    {
      $set: {
        onHand: stock.onHand,
        reserved: stock.reserved ?? 0,
        ...(stock.isActive !== undefined ? { isActive: stock.isActive } : {}),
      },
    },
  );

  return variantId;
};

const setLowStockThreshold = async (adminCookie: string, threshold: number): Promise<void> => {
  await request(app)
    .patch("/api/v1/admin/settings/inventory")
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ lowStockThreshold: threshold });
};

describe("GET /admin/variants/stats · autorización", () => {
  it("anónimo responde 401", async () => {
    expect((await request(app).get(STATS_URL)).status).toBe(401);
  });

  it("cliente responde 403", async () => {
    const customerCookie = await loginAsCustomer(app);
    expect((await request(app).get(STATS_URL).set("Cookie", customerCookie)).status).toBe(403);
  });
});

describe("GET /admin/variants/stats · conteos", () => {
  it("clasifica sin stock, bajo stock y disponible con el umbral configurado", async () => {
    const adminCookie = await loginAsAdmin(app);
    await setLowStockThreshold(adminCookie, 3);
    await seedVariant(adminCookie, "I1", { onHand: 10 });
    await seedVariant(adminCookie, "I2", { onHand: 0 });
    await seedVariant(adminCookie, "I3", { onHand: 2 });

    const res = await request(app).get(STATS_URL).set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.activeVariants).toBe(3);
    expect(res.body.data.outOfStock).toBe(1);
    expect(res.body.data.lowStock).toBe(1);
    // Guards against leaking Mongo's aggregation `_id: null` grouping artifact.
    expect(res.body.data).not.toHaveProperty("_id");
  });

  it("reporta unidades reservadas y disponibles correctamente", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedVariant(adminCookie, "I4", { onHand: 5, reserved: 2 });

    const res = await request(app).get(STATS_URL).set("Cookie", adminCookie);

    expect(res.body.data.unitsOnHand).toBe(5);
    expect(res.body.data.unitsReserved).toBe(2);
    expect(res.body.data.unitsAvailable).toBe(3);
  });

  it("el umbral viene de Settings, no está hardcodeado", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedVariant(adminCookie, "I5", { onHand: 10 });
    await setLowStockThreshold(adminCookie, 10);

    const res = await request(app).get(STATS_URL).set("Cookie", adminCookie);

    expect(res.body.data.lowStockThreshold).toBe(10);
    expect(res.body.data.lowStock).toBe(1);
  });

  it("una variante inactiva no cuenta en ninguna métrica", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedVariant(adminCookie, "I6", { onHand: 0, isActive: false });

    const res = await request(app).get(STATS_URL).set("Cookie", adminCookie);

    expect(res.body.data.activeVariants).toBe(0);
    expect(res.body.data.outOfStock).toBe(0);
  });

  it("lowStockItems trae sku y available, ordenado ascendente, hasta 20", async () => {
    const adminCookie = await loginAsAdmin(app);
    await setLowStockThreshold(adminCookie, 5);
    await seedVariant(adminCookie, "I7", { onHand: 3 });
    await seedVariant(adminCookie, "I8", { onHand: 1 });

    const res = await request(app).get(STATS_URL).set("Cookie", adminCookie);

    const items = res.body.data.lowStockItems as { sku: string; available: number }[];
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0]!.available).toBeLessThanOrEqual(items[1]!.available);
    expect(items[0]).toHaveProperty("sku");
  });

  it("lowStockItems trae el nombre del producto, no solo el SKU", async () => {
    const adminCookie = await loginAsAdmin(app);
    await setLowStockThreshold(adminCookie, 5);
    await seedVariant(adminCookie, "I9", { onHand: 1 });

    const res = await request(app).get(STATS_URL).set("Cookie", adminCookie);

    const items = res.body.data.lowStockItems as { sku: string; productName: string }[];
    const match = items.find((item) => item.productName === "Producto I9");
    expect(match).toBeDefined();
    expect(match?.sku).toEqual(expect.any(String));
  });

  it("sin variantes, responde todo en cero y arreglo vacío", async () => {
    const adminCookie = await loginAsAdmin(app);

    const res = await request(app).get(STATS_URL).set("Cookie", adminCookie);

    expect(res.body.data.activeVariants).toBe(0);
    expect(res.body.data.outOfStock).toBe(0);
    expect(res.body.data.lowStock).toBe(0);
    expect(res.body.data.unitsOnHand).toBe(0);
    expect(res.body.data.unitsReserved).toBe(0);
    expect(res.body.data.unitsAvailable).toBe(0);
    expect(res.body.data.lowStockItems).toEqual([]);
  });
});
