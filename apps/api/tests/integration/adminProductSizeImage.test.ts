import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();
const BASE = "/api/v1/admin/products";

const IMAGE = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/products/tamano.jpg",
  publicId: "gira/products/tamano",
  width: 900,
  height: 900,
};

const seedCategory = () => ProductCategory.create({ name: "Cosmetiqueras", slug: "cosmetiqueras-si" });

const post = (cookie: string, body: Record<string, unknown>) =>
  request(app).post(BASE).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

const patch = (cookie: string, id: string, body: Record<string, unknown>) =>
  request(app).patch(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

const base = (categoryId: string) => ({
  name: "Cosmetiquera chica",
  category: categoryId,
  basePrice: 18900,
  weightGrams: 140,
});

describe("Admin · Product · sizeImage", () => {
  it("se guarda al crear", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory();
    const res = await post(cookie, { ...base(String(category._id)), sizeImage: IMAGE });
    expect(res.status).toBe(201);
    const saved = await Product.findById(res.body.data.product.id).lean();
    expect(saved?.sizeImage).toMatchObject(IMAGE);
  });

  it("se reemplaza al editar", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory();
    const created = await post(cookie, { ...base(String(category._id)), sizeImage: IMAGE });
    const next = { ...IMAGE, publicId: "gira/products/otra" };
    const res = await patch(cookie, created.body.data.product.id, { sizeImage: next });
    expect(res.status).toBe(200);
    const saved = await Product.findById(created.body.data.product.id).lean();
    expect(saved?.sizeImage?.publicId).toBe("gira/products/otra");
  });

  it("null la quita", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory();
    const created = await post(cookie, { ...base(String(category._id)), sizeImage: IMAGE });
    const res = await patch(cookie, created.body.data.product.id, { sizeImage: null });
    expect(res.status).toBe(200);
    const saved = await Product.findById(created.body.data.product.id).lean();
    expect(saved?.sizeImage).toBeUndefined();
  });

  it("rechaza una URL que no es https", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory();
    const res = await post(cookie, {
      ...base(String(category._id)),
      sizeImage: { ...IMAGE, url: "http://insegura.test/a.jpg" },
    });
    expect(res.status).toBe(400);
  });
});
