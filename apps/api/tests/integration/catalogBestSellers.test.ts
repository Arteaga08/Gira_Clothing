import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import { setOnHand } from "../../src/services/inventoryService.js";
import { Print } from "../../src/models/Print.js";
import { PrintFamily } from "../../src/models/PrintFamily.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { Variant } from "../../src/models/Variant.js";

const app = buildApp();

const CATEGORIES = "/api/v1/admin/product-categories";
const PRODUCTS = "/api/v1/admin/products";
const CATALOG_PRODUCTS = "/api/v1/catalog/products";
const CATALOG_CATEGORIES = "/api/v1/catalog/categories";

const image = (name: string) => ({
  url: `https://res.cloudinary.com/gira/image/upload/v1/${name}.jpg`,
  publicId: `gira/${name}`,
  width: 800,
  height: 600,
});

const seedPrint = async (name: string, sku: string, isActive = true) => {
  const family =
    (await PrintFamily.findOne({ slug: "flores" })) ?? (await PrintFamily.create({ name: "Flores", slug: "flores" }));
  return Print.create({ name, slug: name.toLowerCase(), sku, family: family._id, image: image(`print-${sku}`), isActive });
};

const seedVariant = (
  productId: unknown,
  printId: unknown,
  sku: string,
  extra: Record<string, unknown> = {},
) => Variant.create({ product: productId, print: printId, sku, images: [], onHand: 5, reserved: 0, ...extra });

const seedProduct = (categoryId: unknown, name: string, extra: Record<string, unknown> = {}) =>
  Product.create({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), category: categoryId, basePrice: 30000, weightGrams: 300, ...extra });

const list = (query = "") => request(app).get(`${CATALOG_PRODUCTS}${query}`);

describe("Categoría · color", () => {
  it("se guarda al crear, se cambia al editar y el catálogo público lo expone", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await request(app).post(CATEGORIES).set("Origin", ORIGIN).set("Cookie", cookie).send({ name: "Gorras", color: "ikat" });
    expect(created.status).toBe(201);
    expect(created.body.data.category.color).toBe("ikat");

    const patched = await request(app)
      .patch(`${CATEGORIES}/${created.body.data.category.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ color: "tangerine" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.category.color).toBe("tangerine");

    const pub = await request(app).get(CATALOG_CATEGORIES);
    expect(pub.body.data.categories[0].color).toBe("tangerine");
  });

  it("sin color elegido queda en hueso", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).post(CATEGORIES).set("Origin", ORIGIN).set("Cookie", cookie).send({ name: "Totes" });
    expect(res.body.data.category.color).toBe("bone");
  });

  it("rechaza un color fuera de la lista (el amarillo es del botón)", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).post(CATEGORIES).set("Origin", ORIGIN).set("Cookie", cookie).send({ name: "Totes", color: "yellow" });
    expect(res.status).toBe(400);
  });
});

describe("Producto · bestSeller, cardTags y cardPrint", () => {
  it("se guardan al crear y al editar", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await ProductCategory.create({ name: "Playeras", slug: "playeras" });
    const created = await request(app)
      .post(PRODUCTS)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Playera", category: String(category._id), basePrice: 30000, weightGrams: 300, bestSeller: true, cardTags: ["Fresca", "Suave"] });
    expect(created.status).toBe(201);
    expect(created.body.data.product).toMatchObject({ bestSeller: true, cardTags: ["Fresca", "Suave"] });

    const patched = await request(app)
      .patch(`${PRODUCTS}/${created.body.data.product.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ bestSeller: false });
    expect(patched.body.data.product.bestSeller).toBe(false);
  });

  it("rechaza más de 3 palabras, una palabra larga y una estampa inexistente", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await ProductCategory.create({ name: "Playeras", slug: "playeras" });
    const product = await seedProduct(category._id, "Playera");
    const patch = (body: Record<string, unknown>) =>
      request(app).patch(`${PRODUCTS}/${product._id}`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

    expect((await patch({ cardTags: ["a", "b", "c", "d"] })).status).toBe(400);
    expect((await patch({ cardTags: ["x".repeat(21)] })).status).toBe(400);
    expect((await patch({ cardPrint: "64b7f0f0f0f0f0f0f0f0f0f0" })).status).toBe(400);
  });

  it("cardPrint null devuelve la card al primer variante", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await ProductCategory.create({ name: "Playeras", slug: "playeras" });
    const print = await seedPrint("Nopal", "FLO-NOPAL");
    const product = await seedProduct(category._id, "Playera", { cardPrint: print._id });
    const res = await request(app)
      .patch(`${PRODUCTS}/${product._id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ cardPrint: null });
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id).lean())?.cardPrint).toBeUndefined();
  });
});

describe("GET /catalog/products?bestSeller=true", () => {
  it("devuelve solo los marcados y activos, del más nuevo al más viejo", async () => {
    const category = await ProductCategory.create({ name: "Playeras", slug: "playeras", color: "pink" });
    const print = await seedPrint("Nopal", "FLO-NOPAL");
    const older = await seedProduct(category._id, "Playera vieja", { bestSeller: true, createdAt: new Date("2026-01-01") });
    const newer = await seedProduct(category._id, "Playera nueva", { bestSeller: true, createdAt: new Date("2026-06-01") });
    const plain = await seedProduct(category._id, "Playera común");
    const retired = await seedProduct(category._id, "Playera retirada", { bestSeller: true, isActive: false });
    for (const [p, sku] of [[older, "V1"], [newer, "V2"], [plain, "V3"], [retired, "V4"]] as const) {
      await seedVariant(p._id, print._id, sku);
    }

    const res = await list("?bestSeller=true&sort=-createdAt");
    expect(res.status).toBe(200);
    expect(res.body.data.products.map((p: { name: string }) => p.name)).toEqual(["Playera nueva", "Playera vieja"]);
    expect(res.body.data.products[0].category.color).toBe("pink");
    expect(res.body.data.products[0].bestSeller).toBe(true);
  });

  it("sin el filtro devuelve todos", async () => {
    const category = await ProductCategory.create({ name: "Playeras", slug: "playeras" });
    await seedProduct(category._id, "A", { bestSeller: true });
    await seedProduct(category._id, "B");
    const res = await list();
    expect(res.body.data.products).toHaveLength(2);
  });
});

describe("Card pública del producto", () => {
  const setup = async () => {
    const category = await ProductCategory.create({ name: "Playeras", slug: "playeras" });
    const nopal = await seedPrint("Nopal", "FLO-NOPAL");
    const jacaranda = await seedPrint("Jacaranda", "FLO-JAC");
    return { category, nopal, jacaranda };
  };

  it("usa la variante elegida: sus dos primeras fotos, su precio y disponibilidad", async () => {
    const { category, nopal, jacaranda } = await setup();
    const product = await seedProduct(category._id, "Playera", { bestSeller: true, cardPrint: jacaranda._id, cardTags: ["Fresca"] });
    await seedVariant(product._id, nopal._id, "V-NOPAL", { images: [image("n1")] });
    const chosen = await seedVariant(product._id, jacaranda._id, "V-JAC", {
      images: [image("j1"), image("j2"), image("j3")],
      priceOverride: 35000,
    });

    const [item] = (await list("?bestSeller=true")).body.data.products;
    expect(item.cardTags).toEqual(["Fresca"]);
    expect(item.card).toMatchObject({ variantId: String(chosen._id), price: 35000, isAvailable: true });
    expect(item.card.images.map((i: { publicId: string }) => i.publicId)).toEqual(["gira/j1", "gira/j2"]);
  });

  it("sin elección usa la primera variante con fotos; sin fotos, la imagen de la estampa", async () => {
    const { category, nopal, jacaranda } = await setup();
    const withPhotos = await seedProduct(category._id, "Con fotos", { bestSeller: true });
    await seedVariant(withPhotos._id, nopal._id, "A1", { createdAt: new Date("2026-01-01") });
    const photographed = await seedVariant(withPhotos._id, jacaranda._id, "A2", { images: [image("p1")], createdAt: new Date("2026-02-01") });
    const bare = await seedProduct(category._id, "Sin fotos", { bestSeller: true });
    const bareVariant = await seedVariant(bare._id, nopal._id, "B1");

    const items = (await list("?bestSeller=true")).body.data.products as Array<{ name: string; card: { variantId: string; images: { publicId: string }[] } }>;
    const a = items.find((i) => i.name === "Con fotos");
    const b = items.find((i) => i.name === "Sin fotos");
    expect(a?.card.variantId).toBe(String(photographed._id));
    expect(b?.card.variantId).toBe(String(bareVariant._id));
    expect(b?.card.images[0]?.publicId).toBe("gira/print-FLO-NOPAL");
  });

  it("si la estampa elegida ya no tiene variante activa, cae al respaldo", async () => {
    const { category, nopal, jacaranda } = await setup();
    const product = await seedProduct(category._id, "Playera", { bestSeller: true, cardPrint: jacaranda._id });
    const fallback = await seedVariant(product._id, nopal._id, "V-NOPAL", { images: [image("n1")] });
    await seedVariant(product._id, jacaranda._id, "V-JAC", { isActive: false });

    const [item] = (await list("?bestSeller=true")).body.data.products;
    expect(item.card.variantId).toBe(String(fallback._id));
  });

  it("ignora variantes con la estampa retirada y no trae card si no queda ninguna", async () => {
    const { category } = await setup();
    const retiredPrint = await seedPrint("Vieja", "FLO-OLD", false);
    const product = await seedProduct(category._id, "Playera", { bestSeller: true });
    await seedVariant(product._id, retiredPrint._id, "V-OLD");

    const [item] = (await list("?bestSeller=true")).body.data.products;
    expect(item.card).toBeUndefined();
  });

  it("agotado → isAvailable false, y nunca expone existencias", async () => {
    const { category, nopal } = await setup();
    const product = await seedProduct(category._id, "Playera", { bestSeller: true });
    const variant = await seedVariant(product._id, nopal._id, "V-NOPAL");
    await setOnHand(String(variant._id), 0, {});

    const [item] = (await list("?bestSeller=true")).body.data.products;
    expect(item.card.isAvailable).toBe(false);
    expect(JSON.stringify(item)).not.toMatch(/onHand|reserved|available"/);
  });
});
