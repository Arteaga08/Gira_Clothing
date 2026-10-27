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
    .send({ name: "Tote", category: categoryId, basePrice: 45000, weightGrams: 400, ...overrides });

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

describe("Admin · Product · guard de reactivación bajo categoría retirada", () => {
  it("rechaza reactivar un producto cuya categoría está retirada", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie, "Retirable");
    const created = await createProduct(cookie, categoryId);
    const productId = created.body.data.product.id as string;

    // Product first, then its category — mirrors the order the variant guard
    // test uses, and matches how an admin would actually retire a branch.
    await request(app)
      .delete(`${BASE}/${productId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    await request(app)
      .delete(`${CATEGORIES_BASE}/${categoryId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);

    const res = await request(app)
      .patch(`${BASE}/${productId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ isActive: true });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/categoría/i);
  });

  it("permite reactivar cuando la categoría sigue activa", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie, "Sigue activa");
    const created = await createProduct(cookie, categoryId);
    const productId = created.body.data.product.id as string;

    await request(app)
      .delete(`${BASE}/${productId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);

    const res = await request(app)
      .patch(`${BASE}/${productId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.data.product.isActive).toBe(true);
  });

  it("permite reactivar reasignando a una categoría activa distinta", async () => {
    const cookie = await loginAsAdmin(app);
    const retiredCategoryId = await createCategory(cookie, "Se retira");
    const activeCategoryId = await createCategory(cookie, "Destino activo");
    const created = await createProduct(cookie, retiredCategoryId);
    const productId = created.body.data.product.id as string;

    await request(app)
      .delete(`${BASE}/${productId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    await request(app)
      .delete(`${CATEGORIES_BASE}/${retiredCategoryId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);

    const res = await request(app)
      .patch(`${BASE}/${productId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ isActive: true, category: activeCategoryId });

    expect(res.status).toBe(200);
    expect(res.body.data.product.isActive).toBe(true);
  });
});

describe("Admin · Product · peso para envío", () => {
  it("exige weightGrams al crear y lo devuelve en el DTO", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);

    const missing = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Sin peso", category: categoryId, basePrice: 10000 });
    expect(missing.status).toBe(400);

    const ok = await createProduct(cookie, categoryId, { name: "Con peso", weightGrams: 450 });
    expect(ok.status).toBe(201);
    expect(ok.body.data.product.weightGrams).toBe(450);
  });

  it("rechaza pesos fuera de 1–20000 g o no enteros", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    for (const weightGrams of [0, 20_001, 12.5]) {
      const res = await createProduct(cookie, categoryId, { name: `P ${weightGrams}`, weightGrams });
      expect(res.status).toBe(400);
    }
  });
});

describe("Admin · Product · precio de rebaja", () => {
  const patch = (cookie: string, id: string, body: Record<string, unknown>) =>
    request(app).patch(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

  it("crea con salePrice menor al base y lo devuelve en el DTO del panel", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const res = await createProduct(cookie, categoryId, { salePrice: 39900 });
    expect(res.status).toBe(201);

    const list = await request(app).get(BASE).set("Cookie", cookie);
    const row = (list.body.data.products as Array<{ id: string; salePrice?: number }>).find(
      (p) => p.id === res.body.data.product.id,
    );
    expect(row?.salePrice).toBe(39900);
  });

  it("sin rebaja el DTO no trae salePrice", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    await createProduct(cookie, categoryId);
    const list = await request(app).get(BASE).set("Cookie", cookie);
    expect(list.body.data.products[0]).not.toHaveProperty("salePrice");
  });

  it("rechaza al crear un salePrice igual o mayor al base", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    for (const salePrice of [45000, 50000]) {
      const res = await createProduct(cookie, categoryId, { name: `P ${salePrice}`, salePrice });
      expect(res.status).toBe(400);
    }
  });

  it("rechaza salePrice negativo o no entero", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    for (const salePrice of [-1, 100.5]) {
      const res = await createProduct(cookie, categoryId, { name: `P ${salePrice}`, salePrice });
      expect(res.status).toBe(400);
    }
  });

  it("PATCH pone y quita la rebaja (null)", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const id = (await createProduct(cookie, categoryId)).body.data.product.id as string;

    expect((await patch(cookie, id, { salePrice: 30000 })).status).toBe(200);
    let list = await request(app).get(BASE).set("Cookie", cookie);
    expect(list.body.data.products[0].salePrice).toBe(30000);

    expect((await patch(cookie, id, { salePrice: null })).status).toBe(200);
    list = await request(app).get(BASE).set("Cookie", cookie);
    expect(list.body.data.products[0]).not.toHaveProperty("salePrice");
  });

  it("PATCH rechaza una rebaja que no baja del precio base guardado", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const id = (await createProduct(cookie, categoryId)).body.data.product.id as string;
    const res = await patch(cookie, id, { salePrice: 45000 });
    expect(res.status).toBe(400);
  });

  it("PATCH rechaza bajar el precio base por debajo de la rebaja vigente", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const id = (await createProduct(cookie, categoryId, { salePrice: 39900 })).body.data.product.id as string;
    expect((await patch(cookie, id, { basePrice: 39900 })).status).toBe(400);
    expect((await patch(cookie, id, { basePrice: 30000 })).status).toBe(400);
  });

  it("PATCH permite bajar base y rebaja juntos si la rebaja sigue por debajo", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const id = (await createProduct(cookie, categoryId, { salePrice: 39900 })).body.data.product.id as string;
    expect((await patch(cookie, id, { basePrice: 30000, salePrice: 20000 })).status).toBe(200);
  });

  it("PATCH permite bajar el base si a la vez quita la rebaja", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = await createCategory(cookie);
    const id = (await createProduct(cookie, categoryId, { salePrice: 39900 })).body.data.product.id as string;
    expect((await patch(cookie, id, { basePrice: 30000, salePrice: null })).status).toBe(200);
  });
});
