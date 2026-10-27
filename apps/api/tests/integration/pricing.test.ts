import { describe, it, expect } from "vitest";
import request from "supertest";
import { Currency, PriceRounding, CouponDiscountType } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Product } from "../../src/models/Product.js";
import { Coupon } from "../../src/models/Coupon.js";
import { Print } from "../../src/models/Print.js";
import { updateCurrencySettings, updateTaxSettings } from "../../src/services/settingsService.js";
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
  opts: { basePrice?: number; salePrice?: number; priceOverride?: number } = {},
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: opts.basePrice ?? 20000,
      ...(opts.salePrice !== undefined ? { salePrice: opts.salePrice } : {}),
      weightGrams: 400,
    });
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
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0 });
    expect(quote.subtotal).toBe(10000 * 2 + 7000 * 3);
  });

  it("una sola línea de qty 3 es unitPrice * 3", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant(cookie, "S3", { basePrice: 8000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 3 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0 });
    expect(quote.subtotal).toBe(8000 * 3);
    expect(quote.lines[0]?.lineTotal).toBe(8000 * 3);
  });
});

describe("pricingService · quoteTotals · envío", () => {
  it("suma el envío (MXN) tal cual al total en MXN", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant(cookie, "SH1", { basePrice: 1000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 12_000 });
    expect(quote.shippingCost).toBe(12_000);
    expect(quote.total).toBe(quote.subtotal + 12_000);
  });

  it("convierte el envío a USD con el mismo tipo de cambio y redondeo que los precios", async () => {
    const cookie = await loginAsAdmin(app);
    await updateCurrencySettings({ mxnPerUsdCents: 1800, rounding: PriceRounding.NONE }, CTX);
    const v = await seedVariant(cookie, "SH2", { basePrice: 1000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.USD, shippingMxn: 18_000 });
    // 18 000 centavos MXN a 18.00 MXN/USD = 1 000 centavos USD
    expect(quote.shippingCost).toBe(1_000);
    expect(quote.total).toBe(quote.subtotal + 1_000);
  });

  it("envío gratis (0) no agrega nada", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant(cookie, "SH3", { basePrice: 1000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0 });
    expect(quote.shippingCost).toBe(0);
  });
});

describe("pricingService · quoteTotals · moneda", () => {
  it("en MXN los montos son idénticos a catálogo y exchangeRate queda registrado", async () => {
    const cookie = await loginAsAdmin(app);
    await updateCurrencySettings({ mxnPerUsdCents: 1785, rounding: PriceRounding.NONE }, CTX);
    const v = await seedVariant(cookie, "M1", { basePrice: 10000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0 });
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
    const quote = await quoteTotals(lines, { currency: Currency.USD, shippingMxn: 0 });
    const summedFromLines = quote.lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
    expect(quote.subtotal).toBe(summedFromLines);
  });
});

describe("pricingService · quoteTotals · snapshot", () => {
  it("el resultado incluye exchangeRate y rounding vigentes", async () => {
    const cookie = await loginAsAdmin(app);
    await updateCurrencySettings({ mxnPerUsdCents: 1900, rounding: PriceRounding.UP_TO_UNIT }, CTX);
    const v = await seedVariant(cookie, "SN1", { basePrice: 5000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.USD, shippingMxn: 0 });
    expect(quote.exchangeRate).toBe(1900);
    expect(quote.rounding).toBe(PriceRounding.UP_TO_UNIT);
  });
});

describe("pricingService · quoteTotals · IVA incluido", () => {
  it("una cotización nueva usa la tasa vigente tras cambiarla en Ajustes", async () => {
    const cookie = await loginAsAdmin(app);
    await updateTaxSettings({ rateBps: 800 }, CTX);
    const { variantId } = await seedVariant(cookie, "TAX8", { basePrice: 10800 });
    const lines = await resolveOrderLines([{ variantId, qty: 1 }]);

    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0 });

    expect(quote.taxRateBps).toBe(800);
    expect(quote.tax).toBe(quote.total - Math.round((quote.total * 10000) / 10800));
  });

  it("desglosa el IVA del total, congela la tasa y deja descuento en 0", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(cookie, "TAX1", { basePrice: 10000 });
    const lines = await resolveOrderLines([{ variantId, qty: 1 }]);

    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0 });

    expect(quote.discount).toBe(0);
    expect(quote.taxRateBps).toBe(1600);
    expect(quote.total).toBe(quote.subtotal - quote.discount + quote.shippingCost);
    const net = Math.round((quote.total * 10000) / 11600);
    expect(quote.tax).toBe(quote.total - net);
    expect(quote.tax).toBeGreaterThan(0);
  });

  it("el desglose se calcula en la moneda de cobro (USD)", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(cookie, "TAX2", { basePrice: 20000 });
    const lines = await resolveOrderLines([{ variantId, qty: 2 }]);

    const quote = await quoteTotals(lines, { currency: Currency.USD, shippingMxn: 0 });

    const net = Math.round((quote.total * 10000) / 11600);
    expect(quote.tax).toBe(quote.total - net);
  });
});

describe("pricingService · rebaja", () => {
  it("resolveOrderLines cobra el precio rebajado y marca la línea onSale", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(cookie, "R1", { basePrice: 50000, salePrice: 39900 });
    const [line] = await resolveOrderLines([{ variantId, qty: 2 }]);
    expect(line?.unitPriceMxn).toBe(39900);
    expect(line?.onSale).toBe(true);
  });

  it("el precio especial de la estampa gana a la rebaja y la línea no cuenta como rebajada", async () => {
    const cookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(cookie, "R2", {
      basePrice: 50000,
      salePrice: 39900,
      priceOverride: 45000,
    });
    const [line] = await resolveOrderLines([{ variantId, qty: 1 }]);
    expect(line?.unitPriceMxn).toBe(45000);
    expect(line?.onSale).toBe(false);
  });

  it("el subtotal y el total usan el precio rebajado (USD convertido por unidad)", async () => {
    const cookie = await loginAsAdmin(app);
    await updateCurrencySettings({ mxnPerUsdCents: 1800, rounding: PriceRounding.NONE }, CTX);
    const { variantId } = await seedVariant(cookie, "R3", { basePrice: 50000, salePrice: 36000 });
    const lines = await resolveOrderLines([{ variantId, qty: 2 }]);
    const quote = await quoteTotals(lines, { currency: Currency.USD, shippingMxn: 0 });
    expect(quote.subtotalMxn).toBe(72000);
    expect(quote.subtotal).toBe(2000 * 2);
  });
});

describe("pricingService · cupón sobre artículos en rebaja", () => {
  const percent = (percentOff: number, extra: Record<string, unknown> = {}) =>
    Coupon.create({
      code: "CUPON",
      name: "Cupón",
      discountType: CouponDiscountType.PERCENT,
      percentOff,
      ...extra,
    });

  it("el porcentaje solo descuenta las líneas que no están en rebaja", async () => {
    const cookie = await loginAsAdmin(app);
    const regular = await seedVariant(cookie, "C1", { basePrice: 10000 });
    const sale = await seedVariant(cookie, "C2", { basePrice: 10000, salePrice: 8000 });
    const lines = await resolveOrderLines([
      { variantId: regular.variantId, qty: 1 },
      { variantId: sale.variantId, qty: 1 },
    ]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0, coupon: await percent(10) });
    expect(quote.subtotal).toBe(18000);
    expect(quote.discount).toBe(1000); // 10 % de 10 000, no de 18 000
    expect(quote.total).toBe(17000);
  });

  it("el monto fijo se topa al subtotal elegible, no al total", async () => {
    const cookie = await loginAsAdmin(app);
    const regular = await seedVariant(cookie, "C3", { basePrice: 3000 });
    const sale = await seedVariant(cookie, "C4", { basePrice: 10000, salePrice: 8000 });
    const lines = await resolveOrderLines([
      { variantId: regular.variantId, qty: 1 },
      { variantId: sale.variantId, qty: 1 },
    ]);
    const coupon = await Coupon.create({
      code: "FIJO",
      name: "Fijo",
      discountType: CouponDiscountType.FIXED,
      amountOffMxn: 5000,
    });
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0, coupon });
    expect(quote.discount).toBe(3000);
  });

  it("la línea con precio especial (no rebajada) sí recibe el cupón", async () => {
    const cookie = await loginAsAdmin(app);
    const v = await seedVariant(cookie, "C5", { basePrice: 10000, salePrice: 8000, priceOverride: 9000 });
    const lines = await resolveOrderLines([{ variantId: v.variantId, qty: 1 }]);
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0, coupon: await percent(10) });
    expect(quote.discount).toBe(900);
  });

  it("el mínimo de compra se mide sobre el subtotal completo, rebajas incluidas", async () => {
    const cookie = await loginAsAdmin(app);
    const regular = await seedVariant(cookie, "C6", { basePrice: 5000 });
    const sale = await seedVariant(cookie, "C7", { basePrice: 10000, salePrice: 8000 });
    const lines = await resolveOrderLines([
      { variantId: regular.variantId, qty: 1 },
      { variantId: sale.variantId, qty: 1 },
    ]);
    const coupon = await percent(10, { minSubtotalMxn: 12000 });
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0, coupon });
    expect(quote.discount).toBe(500);
  });

  it("carrito solo con rebajas y un cupón responde 400 y no aplica nada", async () => {
    const cookie = await loginAsAdmin(app);
    const sale = await seedVariant(cookie, "C8", { basePrice: 10000, salePrice: 8000 });
    const lines = await resolveOrderLines([{ variantId: sale.variantId, qty: 1 }]);
    await expect(
      quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0, coupon: await percent(10) }),
    ).rejects.toMatchObject({ statusCode: 400, message: "Este cupón no aplica a artículos en rebaja." });
  });
});
