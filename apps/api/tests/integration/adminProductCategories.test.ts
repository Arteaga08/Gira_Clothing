import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const BASE = "/api/v1/admin/product-categories";

const createCategory = async (cookie: string, overrides: Record<string, unknown> = {}) =>
  request(app)
    .post(BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: "Bolsas", ...overrides });

describe("Admin · ProductCategory · autorización", () => {
  it("GET anónimo responde 401", async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it("POST anónimo responde 401", async () => {
    const res = await request(app).post(BASE).set("Origin", ORIGIN).send({ name: "Bolsas" });
    expect(res.status).toBe(401);
  });

  it("POST como cliente responde 403", async () => {
    const cookie = await loginAsCustomer(app);
    const res = await createCategory(cookie);
    expect(res.status).toBe(403);
  });
});

describe("Admin · ProductCategory · creación", () => {
  it("crea con slug derivado del nombre", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createCategory(cookie, { name: "Fundas de Laptop" });
    expect(res.status).toBe(201);
    expect(res.body.data.category.slug).toBe("fundas-de-laptop");
    expect(res.body.data.category.isActive).toBe(true);
  });

  it("elimina acentos al derivar el slug", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createCategory(cookie, { name: "Cosméticos" });
    expect(res.body.data.category.slug).toBe("cosmeticos");
  });

  it("desambigua el slug cuando el nombre se repite", async () => {
    const cookie = await loginAsAdmin(app);
    await createCategory(cookie, { name: "Cosmetiqueras" });
    const second = await createCategory(cookie, { name: "Cosmetiqueras" });
    expect(second.body.data.category.slug).toBe("cosmetiqueras-2");
  });

  it("sin name responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("name de más de 80 caracteres responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createCategory(cookie, { name: "a".repeat(81) });
    expect(res.status).toBe(400);
  });

  it("descarta campos desconocidos (stripUnknown)", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createCategory(cookie, { isActive: false });
    expect(res.status).toBe(201);
    expect(res.body.data.category.isActive).toBe(true);
  });

  it("registra auditoría PRODUCT_CATEGORY_CREATED", async () => {
    const cookie = await loginAsAdmin(app);
    await createCategory(cookie, { name: "Mochilas" });
    const entries = await AuditLog.find({ action: "product_category_created" }).lean();
    expect(entries).toHaveLength(1);
  });
});

describe("Admin · ProductCategory · listado", () => {
  it("pagina correctamente", async () => {
    const cookie = await loginAsAdmin(app);
    for (let i = 0; i < 25; i += 1) {
      await createCategory(cookie, { name: `Categoría ${i}` });
    }
    const res = await request(app).get(`${BASE}?limit=10&page=3`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toHaveLength(5);
    expect(res.body.meta).toMatchObject({ total: 25, page: 3, limit: 10, pages: 3 });
  });

  it("filtra con ?search=", async () => {
    const cookie = await loginAsAdmin(app);
    await createCategory(cookie, { name: "Tote Bags" });
    await createCategory(cookie, { name: "Cosmetiqueras" });
    const res = await request(app).get(`${BASE}?search=tote`).set("Cookie", cookie);
    expect(res.body.data.categories).toHaveLength(1);
    expect(res.body.data.categories[0].name).toBe("Tote Bags");
  });

  it("filtra con ?isActive=false", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createCategory(cookie, { name: "Retirada" });
    await request(app)
      .delete(`${BASE}/${created.body.data.category.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    const res = await request(app).get(`${BASE}?isActive=false`).set("Cookie", cookie);
    expect(res.body.data.categories).toHaveLength(1);
  });

  it("?limit=1000 responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${BASE}?limit=1000`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });
});

describe("Admin · ProductCategory · detalle", () => {
  it("responde 200 con la categoría", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createCategory(cookie, { name: "Detalle" });
    const res = await request(app)
      .get(`${BASE}/${created.body.data.category.id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.category.name).toBe("Detalle");
  });

  it("id inexistente responde 404", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${BASE}/64b7f3f3f3f3f3f3f3f3f3f3`).set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("id malformado responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${BASE}/no-es-un-id`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });
});

describe("Admin · ProductCategory · actualización", () => {
  it("PATCH renombra y re-sluga", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createCategory(cookie, { name: "Original" });
    const res = await request(app)
      .patch(`${BASE}/${created.body.data.category.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Renombrada" });
    expect(res.status).toBe(200);
    expect(res.body.data.category.slug).toBe("renombrada");
  });

  it("renombrar sin cambiar el nombre no colisiona consigo mismo", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createCategory(cookie, { name: "Estable" });
    const res = await request(app)
      .patch(`${BASE}/${created.body.data.category.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ description: "actualizada" });
    expect(res.status).toBe(200);
    expect(res.body.data.category.slug).toBe("estable");
  });
});

describe("Admin · ProductCategory · baja lógica", () => {
  it("DELETE sin hijos responde 200 y marca isActive:false", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createCategory(cookie, { name: "Sin hijos" });
    const res = await request(app)
      .delete(`${BASE}/${created.body.data.category.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.category.isActive).toBe(false);
  });

  // See tests/integration/adminProducts.test.ts for the guard-against-active-
  // Product cases (activated in Tarea 9, once the Product model exists).

  it("DELETE con hijos solo inactivos responde 200", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createCategory(cookie, { name: "Sin hijos activos" });
    const res = await request(app)
      .delete(`${BASE}/${created.body.data.category.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});
