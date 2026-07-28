import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const BASE = "/api/v1/admin/products";

const createCategory = async (cookie: string, name = "Bolsas") => {
  const res = await request(app)
    .post(CATEGORIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name });
  return res.body.data.category.id as string;
};

const createProduct = async (
  cookie: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
) =>
  request(app)
    .post(BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: "Tote", category: categoryId, basePrice: 45000, ...overrides });

describe("Admin · Product · autorización", () => {
  it("GET anónimo responde 401", async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it("POST como cliente responde 403", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const clientCookie = await loginAsCustomer(app);
    const res = await createProduct(clientCookie, categoryId);
    expect(res.status).toBe(403);
  });
});

describe("Admin · Product · creación", () => {
  it("crea con slug derivado y category poblada", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const res = await createProduct(cookie, categoryId, { name: "Tote Bag Curvy" });
    expect(res.status).toBe(201);
    expect(res.body.data.product.slug).toBe("tote-bag-curvy");
    expect(res.body.data.product.category).toMatchObject({ id: categoryId });
  });

  it("category inexistente responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createProduct(cookie, "64b7f3f3f3f3f3f3f3f3f3f3");
    expect(res.status).toBe(400);
  });

  it("basePrice no entero responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const res = await createProduct(cookie, categoryId, { basePrice: 12.5 });
    expect(res.status).toBe(400);
  });

  it("basePrice negativo responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const res = await createProduct(cookie, categoryId, { basePrice: -1 });
    expect(res.status).toBe(400);
  });

  it("acepta measurements y materials", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const res = await createProduct(cookie, categoryId, {
      measurements: { widthCm: 30, heightCm: 40 },
      materials: ["algodón", "piel vegana"],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.product.materials).toEqual(["algodón", "piel vegana"]);
  });

  it("measurements fuera de rango responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const res = await createProduct(cookie, categoryId, {
      measurements: { widthCm: 5000 },
    });
    expect(res.status).toBe(400);
  });

  it("registra auditoría PRODUCT_CREATED", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    await createProduct(cookie, categoryId);
    const entries = await AuditLog.find({ action: "product_created" }).lean();
    expect(entries).toHaveLength(1);
  });
});

describe("Admin · Product · listado", () => {
  it("filtra por ?category=", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryA = await createCategory(cookie, "Categoría A");
    const categoryB = await createCategory(cookie, "Categoría B");
    await createProduct(cookie, categoryA, { name: "Producto A" });
    await createProduct(cookie, categoryB, { name: "Producto B" });

    const res = await request(app).get(`${BASE}?category=${categoryA}`).set("Cookie", cookie);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].name).toBe("Producto A");
  });

  it("ordena con ?sort=basePrice", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    await createProduct(cookie, categoryId, { name: "Caro", basePrice: 90000 });
    await createProduct(cookie, categoryId, { name: "Barato", basePrice: 10000 });

    const res = await request(app).get(`${BASE}?sort=basePrice`).set("Cookie", cookie);
    expect(res.body.data.products[0].name).toBe("Barato");
    expect(res.body.data.products[1].name).toBe("Caro");
  });
});

describe("Admin · Product · detalle y actualización", () => {
  it("detalle responde 200", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const created = await createProduct(cookie, categoryId);
    const res = await request(app)
      .get(`${BASE}/${created.body.data.product.id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("PATCH renombra y re-sluga", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const created = await createProduct(cookie, categoryId, { name: "Original" });
    const res = await request(app)
      .patch(`${BASE}/${created.body.data.product.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Renombrado" });
    expect(res.status).toBe(200);
    expect(res.body.data.product.slug).toBe("renombrado");
  });
});

describe("Admin · Product · baja lógica", () => {
  it("DELETE sin variantes responde 200", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const created = await createProduct(cookie, categoryId);
    const res = await request(app)
      .delete(`${BASE}/${created.body.data.product.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.product.isActive).toBe(false);
  });

  // See tests/integration/adminVariants.test.ts for the guard-against-active-
  // Variant case (activated in Tarea 10, once the Variant model exists).
});

describe("Admin · ProductCategory · guard de baja con Product activo (activado en Tarea 9)", () => {
  it("DELETE de la categoría con un Product activo responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie, "Con hijos");
    await createProduct(cookie, categoryId);
    const res = await request(app)
      .delete(`${CATEGORIES_BASE}/${categoryId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(409);
  });

  it("DELETE de la categoría con el Product ya inactivo responde 200", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie, "Hijo inactivo");
    const created = await createProduct(cookie, categoryId);
    await request(app)
      .delete(`${BASE}/${created.body.data.product.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    const res = await request(app)
      .delete(`${CATEGORIES_BASE}/${categoryId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});
