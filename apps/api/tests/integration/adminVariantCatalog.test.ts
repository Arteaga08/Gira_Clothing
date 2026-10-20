import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Print } from "../../src/models/Print.js";
import { Variant } from "../../src/models/Variant.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import { seedVariant } from "../helpers/seedInventory.js";

const app = buildApp();
const BASE = "/api/v1/admin/variants";

const img = (name: string) => ({
  url: `https://res.cloudinary.com/gira/image/upload/v1/variants/${name}.jpg`,
  publicId: `gira/variants/${name}`,
  width: 800,
  height: 800,
});

const send = (method: "post" | "patch" | "delete", cookie: string, path: string, body?: unknown) => {
  const req = request(app)[method](`${BASE}${path}`).set("Origin", ORIGIN).set("Cookie", cookie);
  return body === undefined ? req : req.send(body as object);
};

/** A seeded variant plus a second print of the same family, so POST has a free (product, print) pair. */
const seedWithSpare = async (tag: string) => {
  const base = await seedVariant({ tag });
  const first = await Print.findById(base.printId);
  const spare = await Print.create({
    name: `Print ${tag} b`,
    slug: `print-${tag}-b`.toLowerCase(),
    sku: `P-${tag}-B`,
    family: first!.family,
    image: img("spare"),
  });
  return { ...base, sparePrintId: String(spare._id) };
};

describe("Variantes del catálogo responden AdminVariant", () => {
  it("POST devuelve producto, estampa e imágenes", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedWithSpare("C1");
    const res = await send("post", cookie, "", {
      product: seeded.productId,
      print: seeded.sparePrintId,
      images: [img("a"), img("b")],
      priceOverride: 25000,
    });
    expect(res.status).toBe(201);
    const variant = res.body.data.variant;
    expect(variant).toMatchObject({
      priceOverride: 25000,
      isActive: true,
      onHand: 0,
      product: { id: seeded.productId, name: "Modelo C1" },
      print: { id: seeded.sparePrintId },
    });
    expect(variant.images.map((i: { publicId: string }) => i.publicId)).toEqual([
      "gira/variants/a",
      "gira/variants/b",
    ]);
    expect(variant.updatedAt).toBeTruthy();
  });

  it("GET /:id incluye las imágenes", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C2" });
    await Variant.updateOne({ _id: seeded.id }, { $set: { images: [img("x")] } });
    const res = await send("patch", cookie, `/${seeded.id}`, { priceOverride: 100 });
    expect(res.body.data.variant.images).toHaveLength(1);
    const detail = await request(app).get(`${BASE}/${seeded.id}`).set("Cookie", cookie);
    expect(detail.body.data.variant.images).toHaveLength(1);
    expect(detail.body.data.variant.product.category.name).toBe("Categoría C2");
  });

  it("PATCH con priceOverride null quita el precio especial", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C3" });
    await send("patch", cookie, `/${seeded.id}`, { priceOverride: 12000 });
    const res = await send("patch", cookie, `/${seeded.id}`, { priceOverride: null });
    expect(res.status).toBe(200);
    expect(res.body.data.variant).not.toHaveProperty("priceOverride");
    const saved = await Variant.findById(seeded.id).lean();
    expect(saved?.priceOverride).toBeUndefined();
  });

  it("PATCH reemplaza las imágenes y respeta el orden", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C4" });
    const res = await send("patch", cookie, `/${seeded.id}`, { images: [img("segunda"), img("primera")] });
    expect(res.body.data.variant.images[0].publicId).toBe("gira/variants/segunda");
  });

  it("DELETE responde la variante retirada", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C5" });
    const res = await send("delete", cookie, `/${seeded.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.variant).toMatchObject({ id: seeded.id, isActive: false });
  });

  it("el create sigue rechazando priceOverride null", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedWithSpare("C6");
    const res = await send("post", cookie, "", {
      product: seeded.productId,
      print: seeded.sparePrintId,
      priceOverride: null,
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/variants · withImages", () => {
  it("por defecto no trae imágenes y con withImages=true sí", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C7" });
    await Variant.updateOne({ _id: seeded.id }, { $set: { images: [img("l")] } });
    const plain = await request(app).get(`${BASE}?product=${seeded.productId}`).set("Cookie", cookie);
    expect(plain.body.data.variants[0]).not.toHaveProperty("images");
    const withImages = await request(app)
      .get(`${BASE}?product=${seeded.productId}&withImages=true`)
      .set("Cookie", cookie);
    expect(withImages.body.data.variants[0].images).toHaveLength(1);
  });

  it("el ajuste de stock sigue sin traer imágenes", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C8", onHand: 5 });
    const res = await send("patch", cookie, `/${seeded.id}/stock`, { delta: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.variant).not.toHaveProperty("images");
  });
});
