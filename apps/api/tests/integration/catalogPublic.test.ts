import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import { setOnHand } from "../../src/services/inventoryService.js";
import type { RequestContext } from "../../src/utils/requestContext.js";
import { Print } from "../../src/models/Print.js";

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";

const CATALOG_FAMILIES = "/api/v1/catalog/families";
const CATALOG_PRINTS = "/api/v1/catalog/prints";
const CATALOG_CATEGORIES = "/api/v1/catalog/categories";
const CATALOG_PRODUCTS = "/api/v1/catalog/products";

const CTX: RequestContext = {};

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

const createFamily = async (cookie: string, name: string) => {
  const res = await request(app)
    .post(FAMILIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name });
  return res.body.data.family as { id: string; slug: string };
};

const createPrint = async (
  cookie: string,
  familyId: string,
  name: string,
  sku: string,
) => {
  const res = await request(app)
    .post(PRINTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name, sku, family: familyId, image: validImage });
  return res.body.data.print as { id: string; slug: string };
};

const createCategory = async (cookie: string, name: string) => {
  const res = await request(app)
    .post(CATEGORIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name });
  return res.body.data.category as { id: string; slug: string };
};

const createProduct = async (cookie: string, categoryId: string, name: string) => {
  const res = await request(app)
    .post(PRODUCTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name, category: categoryId, basePrice: 25000 });
  return res.body.data.product as { id: string; slug: string };
};

const createVariant = async (cookie: string, productId: string, printId: string) => {
  const res = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ product: productId, print: printId, images: [validImage] });
  return res.body.data.variant as { id: string };
};

describe("Catálogo público · acceso sin autenticación", () => {
  it("GET /catalog/products responde 200 sin cookie", async () => {
    const res = await request(app).get(CATALOG_PRODUCTS);
    expect(res.status).toBe(200);
  });

  it("GET /catalog/families responde 200 sin cookie", async () => {
    const res = await request(app).get(CATALOG_FAMILIES);
    expect(res.status).toBe(200);
  });
});

describe("Catálogo público · exclusión de inactivos", () => {
  it("una familia inactiva no aparece en el listado ni en el detalle", async () => {
    const cookie = await loginAsAdmin(app);
    const family = await createFamily(cookie, "Familia Oculta");
    await request(app)
      .delete(`${FAMILIES_BASE}/${family.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);

    const list = await request(app).get(`${CATALOG_FAMILIES}?search=Oculta`);
    expect(list.body.data.families).toHaveLength(0);

    const detail = await request(app).get(`${CATALOG_FAMILIES}/${family.slug}`);
    expect(detail.status).toBe(404);
  });

  it("un producto inactivo no aparece en el listado público", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await createCategory(cookie, "Categoría Oculta");
    const product = await createProduct(cookie, category.id, "Producto Oculto Único");
    await request(app)
      .delete(`${PRODUCTS_BASE}/${product.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);

    const res = await request(app).get(`${CATALOG_PRODUCTS}?search=Oculto Único`);
    expect(res.body.data.products).toHaveLength(0);
  });

  it("slug desconocido en cualquier detalle responde 404", async () => {
    const res = await request(app).get(`${CATALOG_PRODUCTS}/no-existe-este-producto`);
    expect(res.status).toBe(404);
  });
});

describe("Catálogo público · filtro cruzado por print y por family", () => {
  it("?print=<slug> devuelve solo productos con una variante activa de ese estampado", async () => {
    const cookie = await loginAsAdmin(app);
    const family = await createFamily(cookie, "Familia Cruce A");
    const printA = await createPrint(cookie, family.id, "Print Cruce A", "SKU-CRUCE-A");
    const printB = await createPrint(cookie, family.id, "Print Cruce B", "SKU-CRUCE-B");
    const category = await createCategory(cookie, "Categoría Cruce A");
    const productWithA = await createProduct(cookie, category.id, "Producto Con A");
    const productWithB = await createProduct(cookie, category.id, "Producto Con B");
    await createVariant(cookie, productWithA.id, printA.id);
    await createVariant(cookie, productWithB.id, printB.id);

    const res = await request(app).get(`${CATALOG_PRODUCTS}?print=${printA.slug}`);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].slug).toBe(productWithA.slug);
  });

  it("?family=<slug> devuelve la unión de productos de todos los prints activos de la familia", async () => {
    const cookie = await loginAsAdmin(app);
    const family = await createFamily(cookie, "Familia Cruce B");
    const printA = await createPrint(cookie, family.id, "Print Unión A", "SKU-UNION-A");
    const printB = await createPrint(cookie, family.id, "Print Unión B", "SKU-UNION-B");
    const otherFamily = await createFamily(cookie, "Familia Ajena");
    const printC = await createPrint(cookie, otherFamily.id, "Print Ajeno", "SKU-AJENO");
    const category = await createCategory(cookie, "Categoría Unión");
    const productA = await createProduct(cookie, category.id, "Producto Unión A");
    const productB = await createProduct(cookie, category.id, "Producto Unión B");
    const productC = await createProduct(cookie, category.id, "Producto Ajeno");
    await createVariant(cookie, productA.id, printA.id);
    await createVariant(cookie, productB.id, printB.id);
    await createVariant(cookie, productC.id, printC.id);

    const res = await request(app).get(`${CATALOG_PRODUCTS}?family=${family.slug}`);
    const slugs = (res.body.data.products as { slug: string }[]).map((p) => p.slug).sort();
    expect(slugs).toEqual([productA.slug, productB.slug].sort());
  });

  it("combina ?print= y ?category=", async () => {
    const cookie = await loginAsAdmin(app);
    const family = await createFamily(cookie, "Familia Combo");
    const print = await createPrint(cookie, family.id, "Print Combo", "SKU-COMBO");
    const categoryA = await createCategory(cookie, "Categoría Combo A");
    const categoryB = await createCategory(cookie, "Categoría Combo B");
    const productA = await createProduct(cookie, categoryA.id, "Producto Combo A");
    const productB = await createProduct(cookie, categoryB.id, "Producto Combo B");
    await createVariant(cookie, productA.id, print.id);
    await createVariant(cookie, productB.id, print.id);

    const res = await request(app).get(
      `${CATALOG_PRODUCTS}?print=${print.slug}&category=${categoryA.slug}`,
    );
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].slug).toBe(productA.slug);
  });

  it("print de slug desconocido responde 404", async () => {
    const res = await request(app).get(`${CATALOG_PRODUCTS}?print=no-existe`);
    expect(res.status).toBe(404);
  });

  it("familia sin estampados activos devuelve lista vacía con meta.total 0", async () => {
    const cookie = await loginAsAdmin(app);
    const family = await createFamily(cookie, "Familia Vacía");
    const res = await request(app).get(`${CATALOG_PRODUCTS}?family=${family.slug}`);
    expect(res.body.data.products).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });

  it("pagina correctamente a través de 2 páginas", async () => {
    const cookie = await loginAsAdmin(app);
    const family = await createFamily(cookie, "Familia Paginación");
    const print = await createPrint(cookie, family.id, "Print Paginación", "SKU-PAGIN");
    const category = await createCategory(cookie, "Categoría Paginación");
    for (let i = 0; i < 7; i += 1) {
      const product = await createProduct(cookie, category.id, `Producto Paginación ${i}`);
      await createVariant(cookie, product.id, print.id);
    }

    const page1 = await request(app).get(
      `${CATALOG_PRODUCTS}?print=${print.slug}&limit=5&page=1`,
    );
    const page2 = await request(app).get(
      `${CATALOG_PRODUCTS}?print=${print.slug}&limit=5&page=2`,
    );
    expect(page1.body.data.products).toHaveLength(5);
    expect(page2.body.data.products).toHaveLength(2);
    expect(page1.body.meta).toMatchObject({ total: 7, page: 1, limit: 5, pages: 2 });
  });
});

describe("Catálogo público · detalle de producto", () => {
  it("devuelve variantes activas con available y sin onHand/reserved", async () => {
    const cookie = await loginAsAdmin(app);
    const family = await createFamily(cookie, "Familia Detalle");
    const print = await createPrint(cookie, family.id, "Print Detalle", "SKU-DETALLE");
    const category = await createCategory(cookie, "Categoría Detalle");
    const product = await createProduct(cookie, category.id, "Producto Detalle Único");
    const variant = await createVariant(cookie, product.id, print.id);
    await setOnHand(variant.id, 8, CTX);

    const res = await request(app).get(`${CATALOG_PRODUCTS}/${product.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.product.variants).toHaveLength(1);
    const publicVariant = res.body.data.product.variants[0];
    expect(publicVariant.available).toBe(8);
    expect(publicVariant).not.toHaveProperty("onHand");
    expect(publicVariant).not.toHaveProperty("reserved");
  });

  it("excluye variantes cuyo estampado fue desactivado", async () => {
    const cookie = await loginAsAdmin(app);
    const family = await createFamily(cookie, "Familia Detalle 2");
    const print = await createPrint(cookie, family.id, "Print Detalle 2", "SKU-DETALLE-2");
    const category = await createCategory(cookie, "Categoría Detalle 2");
    const product = await createProduct(cookie, category.id, "Producto Detalle Dos");
    await createVariant(cookie, product.id, print.id);

    // Unreachable via the API by design (M3 Tarea 9 closes M2's pendiente #2):
    // the print↔active-variant guard forbids deactivating a print while an
    // active variant references it, AND variantService now forbids
    // reactivating a variant whose print is retired. So "active variant,
    // retired print" can no longer be produced through any request sequence —
    // it only exists as legacy/manually-edited data. This test simulates that
    // by writing isActive:false directly on the Print document, and asserts
    // the public catalog still defends against it either way.
    await Print.updateOne({ _id: print.id }, { $set: { isActive: false } });

    const res = await request(app).get(`${CATALOG_PRODUCTS}/${product.slug}`);
    expect(res.body.data.product.variants).toHaveLength(0);
  });
});

describe("Catálogo público · familias, prints y categorías", () => {
  it("GET /catalog/prints?family=<slug> filtra por familia", async () => {
    const cookie = await loginAsAdmin(app);
    const family = await createFamily(cookie, "Familia Filtro Print");
    await createPrint(cookie, family.id, "Print Filtro", "SKU-FILTRO");
    const otherFamily = await createFamily(cookie, "Otra Familia Filtro");
    await createPrint(cookie, otherFamily.id, "Print Otro Filtro", "SKU-OTRO-FILTRO");

    const res = await request(app).get(`${CATALOG_PRINTS}?family=${family.slug}`);
    expect(res.body.data.prints).toHaveLength(1);
  });

  it("GET /catalog/categories lista solo categorías activas", async () => {
    const res = await request(app).get(CATALOG_CATEGORIES);
    expect(res.status).toBe(200);
    for (const category of res.body.data.categories as { isActive?: boolean }[]) {
      expect(category.isActive).not.toBe(false);
    }
  });
});
