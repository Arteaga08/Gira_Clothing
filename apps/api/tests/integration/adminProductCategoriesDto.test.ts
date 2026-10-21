import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();
const BASE = "/api/v1/admin/product-categories";

const createCategory = (cookie: string, name = "Camisetas", description?: string) =>
  request(app)
    .post(BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name, ...(description ? { description } : {}) });

let seq = 0;
const seedProduct = async (categoryId: string, name: string, isActive = true) => {
  seq += 1;
  await Product.create({
    name,
    slug: `modelo-cat-dto-${seq}`,
    category: categoryId,
    basePrice: 30000,
    weightGrams: 400,
    isActive,
  });
};

describe("Admin · ProductCategory · DTO de admin", () => {
  it("el listado trae conteos, modelos activos (A-Z) y updatedAt", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = (await createCategory(cookie)).body.data.category.id as string;
    await seedProduct(categoryId, "Neceser");
    await seedProduct(categoryId, "Cosmetiquera");
    await seedProduct(categoryId, "Retirado", false);

    const res = await request(app).get(BASE).set("Cookie", cookie);
    const category = res.body.data.categories[0];
    expect(category).toMatchObject({ id: categoryId, name: "Camisetas", productCount: 3, activeProductCount: 2 });
    expect(category.activeProducts.map((print: { name: string }) => print.name)).toEqual(["Cosmetiquera", "Neceser"]);
    expect(category.activeProducts[0].id).toEqual(expect.any(String));
    expect(typeof category.updatedAt).toBe("string");
  });

  it("una familia sin modelos trae ceros y lista vacía", async () => {
    const cookie = await loginAsAdmin(app);
    await createCategory(cookie);
    const res = await request(app).get(BASE).set("Cookie", cookie);
    expect(res.body.data.categories[0]).toMatchObject({ productCount: 0, activeProductCount: 0, activeProducts: [] });
  });

  it("activeProducts se corta en 10 y activeProductCount trae el total real", async () => {
    const cookie = await loginAsAdmin(app);
    const categoryId = (await createCategory(cookie)).body.data.category.id as string;
    for (let index = 0; index < 12; index += 1) await seedProduct(categoryId, `Modelo ${String(index).padStart(2, "0")}`);

    const res = await request(app).get(`${BASE}/${categoryId}`).set("Cookie", cookie);
    expect(res.body.data.category.activeProductCount).toBe(12);
    expect(res.body.data.category.activeProducts).toHaveLength(10);
  });

  it("filtra por estado y busca por nombre", async () => {
    const cookie = await loginAsAdmin(app);
    await createCategory(cookie, "Camisetas");
    const rayas = (await createCategory(cookie, "Bolsas")).body.data.category.id as string;
    await ProductCategory.updateOne({ _id: rayas }, { isActive: false });

    const active = await request(app).get(`${BASE}?isActive=true`).set("Cookie", cookie);
    expect(active.body.data.categories.map((category: { name: string }) => category.name)).toEqual(["Camisetas"]);
    const retired = await request(app).get(`${BASE}?isActive=false`).set("Cookie", cookie);
    expect(retired.body.data.categories.map((category: { name: string }) => category.name)).toEqual(["Bolsas"]);
    const found = await request(app).get(`${BASE}?search=bol`).set("Cookie", cookie);
    expect(found.body.data.categories.map((category: { name: string }) => category.name)).toEqual(["Bolsas"]);
  });

  it("ordena por nombre y por -updatedAt, y un campo fuera de la lista blanca cae al orden por nombre", async () => {
    const cookie = await loginAsAdmin(app);
    await createCategory(cookie, "Zeta");
    await createCategory(cookie, "Alfa");
    const byName = await request(app).get(`${BASE}?sort=name`).set("Cookie", cookie);
    expect(byName.body.data.categories.map((category: { name: string }) => category.name)).toEqual(["Alfa", "Zeta"]);
    const recent = await request(app).get(`${BASE}?sort=-updatedAt`).set("Cookie", cookie);
    expect(recent.body.data.categories.map((category: { name: string }) => category.name)).toEqual(["Alfa", "Zeta"]);
    const unknown = await request(app).get(`${BASE}?sort=slug`).set("Cookie", cookie);
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.categories.map((category: { name: string }) => category.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("las mutaciones responden el DTO de admin", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createCategory(cookie, "Camisetas", "Rosas");
    expect(created.status).toBe(201);
    expect(created.body.data.category).toMatchObject({ productCount: 0, activeProductCount: 0, activeProducts: [], description: "Rosas" });
    const id = created.body.data.category.id as string;
    await seedProduct(id, "Neceser");

    const updated = await request(app)
      .patch(`${BASE}/${id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Camisetas 2" });
    expect(updated.body.data.category).toMatchObject({ name: "Camisetas 2", productCount: 1, activeProductCount: 1 });

    const blocked = await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(blocked.status).toBe(409);
  });

  it("retira sin modelos activos y reactiva sin validar nada", async () => {
    const cookie = await loginAsAdmin(app);
    const id = (await createCategory(cookie)).body.data.category.id as string;
    const retired = await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(retired.status).toBe(200);
    expect(retired.body.data.category).toMatchObject({ isActive: false, productCount: 0 });
    const back = await request(app)
      .patch(`${BASE}/${id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ isActive: true });
    expect(back.body.data.category.isActive).toBe(true);
  });

  it("un id inexistente responde 404", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${BASE}/64b7f0f0f0f0f0f0f0f0f0f0`).set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("ordena los nombres con acentos y sin distinguir mayúsculas", async () => {
    const cookie = await loginAsAdmin(app);
    await createCategory(cookie, "Zeta");
    await createCategory(cookie, "árboles");
    await createCategory(cookie, "Beta");
    const res = await request(app).get(`${BASE}?sort=name`).set("Cookie", cookie);
    expect(res.body.data.categories.map((item: { name: string }) => item.name)).toEqual(["árboles", "Beta", "Zeta"]);
  });
});
