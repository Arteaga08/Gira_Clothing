import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const BASE = "/api/v1/admin/variants";

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

const seedProductAndPrint = async (
  cookie: string,
  suffix: string,
): Promise<{ productId: string; printId: string }> => {
  const familyRes = await request(app)
    .post(FAMILIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: `Familia ${suffix}` });
  const familyId = familyRes.body.data.family.id as string;

  const printRes = await request(app)
    .post(PRINTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: `Print ${suffix}`, sku: `SKU-${suffix}`, family: familyId, image: validImage });
  const printId = printRes.body.data.print.id as string;

  const categoryRes = await request(app)
    .post(CATEGORIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: `Categoría ${suffix}` });
  const categoryId = categoryRes.body.data.category.id as string;

  const productRes = await request(app)
    .post(PRODUCTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 30000 });
  const productId = productRes.body.data.product.id as string;

  return { productId, printId };
};

const createVariant = async (
  cookie: string,
  productId: string,
  printId: string,
  overrides: Record<string, unknown> = {},
) =>
  request(app)
    .post(BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ product: productId, print: printId, images: [validImage], ...overrides });

describe("Admin · Variant · autorización", () => {
  it("GET anónimo responde 401", async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it("POST como cliente responde 403", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId, printId } = await seedProductAndPrint(cookie, "A");
    const clientCookie = await loginAsCustomer(app);
    const res = await createVariant(clientCookie, productId, printId);
    expect(res.status).toBe(403);
  });
});

describe("Admin · Variant · creación", () => {
  it("crea y deriva el SKU de producto + estampado", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId, printId } = await seedProductAndPrint(cookie, "B");
    const res = await createVariant(cookie, productId, printId);
    expect(res.status).toBe(201);
    expect(res.body.data.variant.sku).toBe(`PRODUCTO-B-SKU-B`);
    expect(res.body.data.variant.onHand).toBe(0);
    expect(res.body.data.variant.available).toBe(0);
  });

  it("producto inexistente responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const { printId } = await seedProductAndPrint(cookie, "C");
    const res = await createVariant(cookie, "64b7f3f3f3f3f3f3f3f3f3f3", printId);
    expect(res.status).toBe(400);
  });

  it("estampado inexistente responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId } = await seedProductAndPrint(cookie, "D");
    const res = await createVariant(cookie, productId, "64b7f3f3f3f3f3f3f3f3f3f3");
    expect(res.status).toBe(400);
  });

  it("par (product, print) duplicado responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId, printId } = await seedProductAndPrint(cookie, "E");
    await createVariant(cookie, productId, printId);
    const second = await createVariant(cookie, productId, printId);
    expect(second.status).toBe(409);
  });

  it("sku explícito duplicado responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId: p1, printId: pr1 } = await seedProductAndPrint(cookie, "F1");
    const { productId: p2, printId: pr2 } = await seedProductAndPrint(cookie, "F2");
    await createVariant(cookie, p1, pr1, { sku: "SKU-MANUAL" });
    const second = await createVariant(cookie, p2, pr2, { sku: "SKU-MANUAL" });
    expect(second.status).toBe(409);
  });

  it("priceOverride no entero responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId, printId } = await seedProductAndPrint(cookie, "G");
    const res = await createVariant(cookie, productId, printId, { priceOverride: 10.5 });
    expect(res.status).toBe(400);
  });
});

describe("Admin · Variant · listado", () => {
  it("filtra por ?product= y ?print=", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId: p1, printId: pr1 } = await seedProductAndPrint(cookie, "H1");
    const { productId: p2, printId: pr2 } = await seedProductAndPrint(cookie, "H2");
    await createVariant(cookie, p1, pr1);
    await createVariant(cookie, p2, pr2);

    const byProduct = await request(app).get(`${BASE}?product=${p1}`).set("Cookie", cookie);
    expect(byProduct.body.data.variants).toHaveLength(1);

    const byPrint = await request(app).get(`${BASE}?print=${pr2}`).set("Cookie", cookie);
    expect(byPrint.body.data.variants).toHaveLength(1);
  });
});

describe("Admin · Variant · baja lógica", () => {
  it("DELETE marca isActive:false sin guard de hijos", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId, printId } = await seedProductAndPrint(cookie, "I");
    const created = await createVariant(cookie, productId, printId);
    const res = await request(app)
      .delete(`${BASE}/${created.body.data.variant.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.variant.isActive).toBe(false);
  });
});

describe("Admin · Print · guard de baja con Variant activa (activado en Tarea 10)", () => {
  it("DELETE del print con una Variant activa responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId, printId } = await seedProductAndPrint(cookie, "J");
    await createVariant(cookie, productId, printId);
    const res = await request(app)
      .delete(`${PRINTS_BASE}/${printId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(409);
  });
});

describe("Admin · Product · guard de baja con Variant activa (activado en Tarea 10)", () => {
  it("DELETE del producto con una Variant activa responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const { productId, printId } = await seedProductAndPrint(cookie, "K");
    await createVariant(cookie, productId, printId);
    const res = await request(app)
      .delete(`${PRODUCTS_BASE}/${productId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(409);
  });
});
