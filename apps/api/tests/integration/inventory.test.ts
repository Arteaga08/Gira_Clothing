import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { setOnHand, adjustOnHand } from "../../src/services/inventoryService.js";
import type { RequestContext } from "../../src/utils/requestContext.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

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

const CTX: RequestContext = {};

/** Creates a fresh Variant (onHand: 0, reserved: 0) and returns its id. */
const seedVariant = async (cookie: string, suffix: string): Promise<string> => {
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 20000 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ product: productId, print: printId, images: [validImage] });

  return variantRes.body.data.variant.id as string;
};

const setReserved = async (variantId: string, reserved: number): Promise<void> => {
  await Variant.updateOne({ _id: variantId }, { $set: { reserved } });
};

describe("inventoryService · setOnHand", () => {
  it("fija un valor absoluto en una variante nueva", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "S1");
    const result = await setOnHand(variantId, 25, CTX);
    expect(result.onHand).toBe(25);
    expect(result.available).toBe(25);
  });

  it("rechaza con 409 si reserved excede el nuevo onHand, y no modifica la DB", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "S2");
    await setReserved(variantId, 5);
    await expect(setOnHand(variantId, 3, CTX)).rejects.toMatchObject({ statusCode: 409 });
    const doc = await Variant.findById(variantId).lean();
    expect(doc?.onHand).toBe(0);
  });

  it("acepta el caso frontera: available exactamente 0", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "S3");
    await setReserved(variantId, 5);
    const result = await setOnHand(variantId, 5, CTX);
    expect(result.available).toBe(0);
  });

  it("id inexistente responde 404", async () => {
    await expect(setOnHand("64b7f3f3f3f3f3f3f3f3f3f3", 1, CTX)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("inventoryService · adjustOnHand", () => {
  it("incrementa desde 10 a 15", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "A1");
    await setOnHand(variantId, 10, CTX);
    const result = await adjustOnHand(variantId, 5, CTX);
    expect(result.onHand).toBe(15);
  });

  it("acepta el caso frontera: decremento exacto a 0", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "A2");
    await setOnHand(variantId, 10, CTX);
    const result = await adjustOnHand(variantId, -10, CTX);
    expect(result.onHand).toBe(0);
  });

  it("rechaza con 409 un decremento que dejaría onHand negativo, sin escritura parcial", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "A3");
    await setOnHand(variantId, 10, CTX);
    await expect(adjustOnHand(variantId, -11, CTX)).rejects.toMatchObject({ statusCode: 409 });
    const doc = await Variant.findById(variantId).lean();
    expect(doc?.onHand).toBe(10);
  });

  it("rechaza con 409 cuando reserved reduce el disponible por debajo del decremento", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "A4");
    await setOnHand(variantId, 10, CTX);
    await setReserved(variantId, 4);
    await expect(adjustOnHand(variantId, -7, CTX)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("id inexistente responde 404", async () => {
    await expect(adjustOnHand("64b7f3f3f3f3f3f3f3f3f3f3", -1, CTX)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("inventoryService · auditoría", () => {
  it("un ajuste exitoso registra exactamente un STOCK_ADJUSTED con before/after", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "AU1");
    await setOnHand(variantId, 10, CTX);
    await adjustOnHand(variantId, 5, CTX);
    const entries = await AuditLog.find({ action: "stock_adjusted", targetId: variantId }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.before).toMatchObject({ onHand: 10 });
    expect(entries[0]?.after).toMatchObject({ onHand: 15 });
  });

  it("un 409 no registra auditoría", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "AU2");
    await setOnHand(variantId, 10, CTX);
    await expect(adjustOnHand(variantId, -11, CTX)).rejects.toThrow();
    const entries = await AuditLog.find({ action: "stock_adjusted", targetId: variantId }).lean();
    expect(entries).toHaveLength(0);
  });
});

describe("inventoryService · concurrencia (el invariante que protege contra oversell)", () => {
  it("20 decrementos paralelos de -1 sobre onHand=10: exactamente 10 tienen éxito, el resto 409, onHand final 0", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "C1");
    await setOnHand(variantId, 10, CTX);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => adjustOnHand(variantId, -1, CTX)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );

    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ statusCode: 409 });
    }

    const doc = await Variant.findById(variantId).lean();
    expect(doc?.onHand).toBe(0);
    expect(doc?.onHand).toBeGreaterThanOrEqual(0);
  });

  it("20 decrementos paralelos de -1 sobre onHand=10, reserved=4: exactamente 6 exitosos, onHand final 4", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "C2");
    await setOnHand(variantId, 10, CTX);
    await setReserved(variantId, 4);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => adjustOnHand(variantId, -1, CTX)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(6);

    const doc = await Variant.findById(variantId).lean();
    expect(doc?.onHand).toBe(4);
    expect((doc?.onHand ?? 0) - (doc?.reserved ?? 0)).toBe(0);
  });

  it("carga mixta: 10 decrementos y 10 incrementos en paralelo desde onHand=10 nunca deja onHand negativo", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "C3");
    await setOnHand(variantId, 10, CTX);

    const decrements = Array.from({ length: 10 }, () => adjustOnHand(variantId, -1, CTX));
    const increments = Array.from({ length: 10 }, () => adjustOnHand(variantId, 1, CTX));
    const results = await Promise.allSettled([...decrements, ...increments]);

    const succeededDecrements = results
      .slice(0, 10)
      .filter((r) => r.status === "fulfilled").length;
    const succeededIncrements = results
      .slice(10)
      .filter((r) => r.status === "fulfilled").length;

    expect(succeededIncrements).toBe(10);

    const doc = await Variant.findById(variantId).lean();
    expect(doc?.onHand).toBe(10 - succeededDecrements + succeededIncrements);
    expect(doc?.onHand).toBeGreaterThanOrEqual(0);
  });
});

describe("Admin · Variant · PATCH /:id/stock (HTTP)", () => {
  it("anónimo responde 401", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "H1");
    const res = await request(app)
      .patch(`${VARIANTS_BASE}/${variantId}/stock`)
      .set("Origin", ORIGIN)
      .send({ onHand: 5 });
    expect(res.status).toBe(401);
  });

  it("cliente responde 403", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "H2");
    const clientCookie = await loginAsCustomer(app);
    const res = await request(app)
      .patch(`${VARIANTS_BASE}/${variantId}/stock`)
      .set("Origin", ORIGIN)
      .set("Cookie", clientCookie)
      .send({ onHand: 5 });
    expect(res.status).toBe(403);
  });

  it("admin con { onHand: 12 } responde 200 con available: 12", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "H3");
    const res = await request(app)
      .patch(`${VARIANTS_BASE}/${variantId}/stock`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ onHand: 12 });
    expect(res.status).toBe(200);
    expect(res.body.data.variant.available).toBe(12);
  });

  it("admin con { delta: -999 } sobre stock 0 responde 409 con mensaje en español", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "H4");
    const res = await request(app)
      .patch(`${VARIANTS_BASE}/${variantId}/stock`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ delta: -999 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/insuficiente/i);
  });

  it("{ onHand y delta juntos } responde 400 (xor)", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "H5");
    const res = await request(app)
      .patch(`${VARIANTS_BASE}/${variantId}/stock`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ onHand: 5, delta: 1 });
    expect(res.status).toBe(400);
  });

  it("body vacío responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "H6");
    const res = await request(app)
      .patch(`${VARIANTS_BASE}/${variantId}/stock`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("{ delta: 0 } responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "H7");
    const res = await request(app)
      .patch(`${VARIANTS_BASE}/${variantId}/stock`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ delta: 0 });
    expect(res.status).toBe(400);
  });

  it("{ onHand: -1 } responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "H8");
    const res = await request(app)
      .patch(`${VARIANTS_BASE}/${variantId}/stock`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ onHand: -1 });
    expect(res.status).toBe(400);
  });

  it(":id malformado responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .patch(`${VARIANTS_BASE}/no-es-un-id/stock`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ onHand: 5 });
    expect(res.status).toBe(400);
  });
});
