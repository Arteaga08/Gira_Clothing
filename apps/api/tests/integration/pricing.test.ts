import { describe, it, expect } from "vitest";
import request from "supertest";
import { Currency, PriceRounding } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Product } from "../../src/models/Product.js";
import { Print } from "../../src/models/Print.js";
import { updateCurrencySettings, updateShippingSettings } from "../../src/services/settingsService.js";
import { resolveOrderLines, quoteTotals } from "../../src/services/pricingService.js";
import type { RequestContext } from "../../src/utils/requestContext.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

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

interface SeedResult {
  productId: string;
  printId: string;
  variantId: string;
}

/** Creates a full catalog chain (family, print, category, product, variant). */
const seedVariant = async (
  cookie: string,
  suffix: string,
  opts: { basePrice?: number; priceOverride?: number } = {},
): Promise<SeedResult> => {
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: opts.basePrice ?? 20000 });
  const productId = productRes.body.data.product.id as string;

  const variantPayload: Record<string, unknown> = {
    product: productId,
    print: printId,
    images: [validImage],
  };
  if (opts.priceOverride !== undefined) variantPayload.priceOverride = opts.priceOverride;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send(variantPayload);
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne({ _id: variantId }, { $set: { onHand: 50 } });

  return { productId, printId, variantId };
};

describe("pricingService · resolveOrderLines", () => {
  it("usa product.basePrice cuando la variante no tiene override", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(cookie, "P1", { basePrice: 15000 });

    const [line] = await resolveOrderLines([{ variantId, qty: 1 }]);
    expect(line?.unitPriceMxn).toBe(15000);
  });

  it("usa variant.priceOverride cuando lo tiene, incluido priceOverride: 0", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(cookie, "P2", { basePrice: 15000, priceOverride: 12000 });
    const [line] = await resolveOrderLines([{ variantId, qty: 1 }]);
    expect(line?.unitPriceMxn).toBe(12000);

    const { variantId: freeVariantId } = await seedVariant(cookie, "P2B", {
      basePrice: 15000,
      priceOverride: 0,
    });
    const [freeLine] = await resolveOrderLines([{ variantId: freeVariantId, qty: 1 }]);
    expect(freeLine?.unitPriceMxn).toBe(0);
  });

  it("variante inexistente responde 400", async () => {
    await expect(
      resolveOrderLines([{ variantId: "507f1f77bcf86cd799439011", qty: 1 }]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("variante isActive:false responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(cookie, "P3");
    await Variant.updateOne({ _id: variantId }, { $set: { isActive: false } });
    await expect(resolveOrderLines([{ variantId, qty: 1 }])).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("producto padre inactivo responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId, productId } = await seedVariant(cookie, "P4");
    await Product.updateOne({ _id: productId }, { $set: { isActive: false } });
    await expect(resolveOrderLines([{ variantId, qty: 1 }])).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("print padre inactivo responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId, printId } = await seedVariant(cookie, "P5");
    await Print.updateOne({ _id: printId }, { $set: { isActive: false } });
    await expect(resolveOrderLines([{ variantId, qty: 1 }])).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("línea duplicada del mismo variantId responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(cookie, "P6");
    await expect(
      resolveOrderLines([
        { variantId, qty: 1 },
        { variantId, qty: 2 },
      ]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("pricingService · quoteTotals · subtotal", () => {
  it("suma exacta de 2 líneas con cantidades distintas", async () => {
    const cookie = await loginAsAdmin(app);
    const a = await seedVariant(cookie, "S1", { basePrice: 10000 });
    const b = await seedVariant(cookie, "S2", { basePrice: 7000 });
    const lines = await resolveOrderLines([
      { variantId: a.variantId, qty: 2 },
      { variantId: b.variantId, qty: 3 },
    ]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, destinationCountry: "MX" });
    expect(quote.subtotal).toBe(10000 * 2 + 7000 * 3);
  });

  it("una sola línea de qty 3 es unitPrice * 3", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant(cookie, "S3", { basePrice: 8000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 3 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, destinationCountry: "MX" });
    expect(quote.subtotal).toBe(8000 * 3);
    expect(quote.lines[0]?.lineTotal).toBe(8000 * 3);
  });
});

describe("pricingService · quoteTotals · envío", () => {
  it("destino MX usa nationalFee", async () => {
    const cookie = await loginAsAdmin(app);
    await updateShippingSettings({ nationalFee: 15000, internationalFee: 60000 }, CTX);
    const v = await seedVariant(cookie, "SH1", { basePrice: 1000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, destinationCountry: "MX" });
    expect(quote.shippingCost).toBe(15000);
  });

  it("destino distinto de MX usa internationalFee", async () => {
    const cookie = await loginAsAdmin(app);
    await updateShippingSettings({ nationalFee: 15000, internationalFee: 60000 }, CTX);
    const v = await seedVariant(cookie, "SH2", { basePrice: 1000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, destinationCountry: "US" });
    expect(quote.shippingCost).toBe(60000);
  });

  it("subtotal exactamente igual al umbral: envío 0", async () => {
    const cookie = await loginAsAdmin(app);
    await updateShippingSettings(
      { nationalFee: 15000, internationalFee: 60000, freeShippingThreshold: 20000 },
      CTX,
    );
    const v = await seedVariant(cookie, "SH3", { basePrice: 20000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, destinationCountry: "MX" });
    expect(quote.shippingCost).toBe(0);
  });

  it("un centavo por debajo del umbral: se cobra envío", async () => {
    const cookie = await loginAsAdmin(app);
    await updateShippingSettings(
      { nationalFee: 15000, internationalFee: 60000, freeShippingThreshold: 20000 },
      CTX,
    );
    const v = await seedVariant(cookie, "SH4", { basePrice: 19999 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, destinationCountry: "MX" });
    expect(quote.shippingCost).toBe(15000);
  });

  it("freeShippingThreshold null: siempre se cobra envío", async () => {
    const cookie = await loginAsAdmin(app);
    await updateShippingSettings(
      { nationalFee: 15000, internationalFee: 60000, freeShippingThreshold: null },
      CTX,
    );
    const v = await seedVariant(cookie, "SH5", { basePrice: 5_000_000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, destinationCountry: "MX" });
    expect(quote.shippingCost).toBe(15000);
  });
});

describe("pricingService · quoteTotals · moneda", () => {
  it("en MXN los montos son idénticos a catálogo y exchangeRate queda registrado", async () => {
    const cookie = await loginAsAdmin(app);
    await updateCurrencySettings({ mxnPerUsdCents: 1785, rounding: PriceRounding.NONE }, CTX);
    const v = await seedVariant(cookie, "M1", { basePrice: 10000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, destinationCountry: "MX" });
    expect(quote.subtotal).toBe(10000);
    expect(quote.exchangeRate).toBe(1785);
  });

  it("en USD el subtotal es exactamente la suma de los unitPrice ya convertidos", async () => {
    const cookie = await loginAsAdmin(app);
    await updateCurrencySettings({ mxnPerUsdCents: 1785, rounding: PriceRounding.NONE }, CTX);
    const a = await seedVariant(cookie, "M2A", { basePrice: 10000 });
    const b = await seedVariant(cookie, "M2B", { basePrice: 7000 });
    const lines = await resolveOrderLines([
      { variantId: a.variantId, qty: 2 },
      { variantId: b.variantId, qty: 3 },
    ]);
    const quote = await quoteTotals(lines, { currency: Currency.USD, destinationCountry: "MX" });
    const summedFromLines = quote.lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
    expect(quote.subtotal).toBe(summedFromLines);
  });
});

describe("pricingService · quoteTotals · umbral y moneda", () => {
  it("el umbral de envío gratis se compara siempre contra el subtotal en MXN", async () => {
    const cookie = await loginAsAdmin(app);
    await updateCurrencySettings({ mxnPerUsdCents: 1785, rounding: PriceRounding.NONE }, CTX);
    await updateShippingSettings(
      { nationalFee: 15000, internationalFee: 60000, freeShippingThreshold: 20000 },
      CTX,
    );
    // basePrice 20000 MXN centavos == exactly the MXN threshold, but converts to
    // a much smaller USD number — the threshold must still compare in MXN.
    const v = await seedVariant(cookie, "TH1", { basePrice: 20000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.USD, destinationCountry: "MX" });
    expect(quote.shippingCost).toBe(0);
  });
});

describe("pricingService · quoteTotals · snapshot", () => {
  it("el resultado incluye exchangeRate y rounding vigentes", async () => {
    const cookie = await loginAsAdmin(app);
    await updateCurrencySettings({ mxnPerUsdCents: 1900, rounding: PriceRounding.UP_TO_UNIT }, CTX);
    const v = await seedVariant(cookie, "SN1", { basePrice: 5000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.USD, destinationCountry: "MX" });
    expect(quote.exchangeRate).toBe(1900);
    expect(quote.rounding).toBe(PriceRounding.UP_TO_UNIT);
  });
});
