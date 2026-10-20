import { describe, it, expect, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { Currency } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { ShippingQuote } from "../../src/models/ShippingQuote.js";
import { Settings, SINGLETON_KEY } from "../../src/models/Settings.js";
import { ShippingProviderError } from "../../src/adapters/shipping/index.js";
import {
  createShippingQuote,
  resolveQuotedRate,
} from "../../src/services/shippingQuoteService.js";
import { resolveOrderLines } from "../../src/services/pricingService.js";
import { createCustomer, loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import { seedCatalogVariant, seedShippingOrigin } from "../helpers/orders.js";
import {
  installFakeShippingProvider,
  restoreShippingProvider,
} from "../helpers/fakeShippingProvider.js";

const app = buildApp();
const destination = { postalCode: "64000", state: "NL", city: "Monterrey" };

let variantId: string;
beforeEach(async () => {
  const cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "QUOTE");
  await seedShippingOrigin();
});
afterEach(() => restoreShippingProvider());

const quote = (body: Record<string, unknown>) =>
  request(app).post("/api/v1/shipping/quotes").set("Origin", ORIGIN).send(body);

describe("POST /shipping/quotes", () => {
  it("cotiza con el stub, guarda la cotización y no expone costos internos", async () => {
    const res = await quote({ lines: [{ variantId, qty: 2 }], destination });
    expect(res.status).toBe(200);
    const q = res.body.data.quote;
    expect(q.rates.length).toBeGreaterThanOrEqual(2);
    expect(q.rates[0]).toEqual(
      expect.objectContaining({
        rateId: expect.any(String),
        carrier: "estafeta",
        carrierName: "Estafeta",
        serviceName: "Terrestre",
        amount: 12_000,
        estimatedDays: 5,
      }),
    );
    expect(q.rates[0]).not.toHaveProperty("costMxn");
    expect(new Date(q.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const stored = await ShippingQuote.findOne({ quoteId: q.quoteId }).lean();
    expect(stored?.rates).toHaveLength(q.rates.length);
    expect(stored?.parcel.weightGrams).toBe(400 * 2 + 150);
  });

  it("aplica envío gratis cuando el subtotal alcanza el umbral (el costo real se conserva)", async () => {
    await Settings.updateOne({ key: SINGLETON_KEY }, { $set: { "shipping.freeShippingThreshold": 1 } });
    const res = await quote({ lines: [{ variantId, qty: 1 }], destination });
    expect(res.body.data.quote.rates.every((r: { amount: number }) => r.amount === 0)).toBe(true);
    const stored = await ShippingQuote.findOne({ quoteId: res.body.data.quote.quoteId }).lean();
    expect(stored?.rates[0]?.costMxn).toBeGreaterThan(0);
    expect(stored?.rates[0]?.amountMxn).toBe(0);
  });

  it("convierte el monto a USD cuando se pide esa moneda", async () => {
    const res = await quote({ lines: [{ variantId, qty: 1 }], destination, currency: Currency.USD });
    expect(res.status).toBe(200);
    expect(res.body.data.quote.currency).toBe("USD");
    expect(res.body.data.quote.rates[0].amount).toBeLessThan(12_000);
  });

  it("503 si el origen no está configurado", async () => {
    await Settings.updateOne({ key: SINGLETON_KEY }, { $unset: { "shipping.origin": "" } });
    const res = await quote({ lines: [{ variantId, qty: 1 }], destination });
    expect(res.status).toBe(503);
  });

  it("400 con estado o CP inválidos", async () => {
    for (const bad of [{ state: "ZZ" }, { postalCode: "123" }]) {
      const res = await quote({ lines: [{ variantId, qty: 1 }], destination: { ...destination, ...bad } });
      expect(res.status).toBe(400);
    }
  });

  it("bloquea (502) cuando Envía está caído y 422 cuando rechaza la dirección o no hay opciones", async () => {
    const fake = installFakeShippingProvider();
    fake.getRates.mockRejectedValueOnce(new ShippingProviderError("unavailable", "caído"));
    expect((await quote({ lines: [{ variantId, qty: 1 }], destination })).status).toBe(502);
    fake.getRates.mockRejectedValueOnce(new ShippingProviderError("rejected", "CP inválido"));
    expect((await quote({ lines: [{ variantId, qty: 1 }], destination })).status).toBe(422);
    fake.getRates.mockResolvedValueOnce([]);
    expect((await quote({ lines: [{ variantId, qty: 1 }], destination })).status).toBe(422);
  });

  it("422 si un producto no tiene peso configurado", async () => {
    const { Product } = await import("../../src/models/Product.js");
    await Product.collection.updateMany({}, { $unset: { weightGrams: "" } });
    const res = await quote({ lines: [{ variantId, qty: 1 }], destination });
    expect(res.status).toBe(422);
  });

  it("useCart sin sesión es 401; lines y useCart juntos es 400", async () => {
    expect((await quote({ useCart: true, destination })).status).toBe(401);
    expect(
      (await quote({ lines: [{ variantId, qty: 1 }], useCart: true, destination })).status,
    ).toBe(400);
  });
});

describe("resolveQuotedRate", () => {
  const make = async (qty = 1, currency: Currency = Currency.MXN, userId?: mongoose.Types.ObjectId) =>
    createShippingQuote(
      { lines: [{ variantId, qty }], currency, destination: { ...destination, postalCode: "01000" } },
      { userId },
    );
  const resolveWith = async (
    q: Awaited<ReturnType<typeof make>>,
    over: Partial<Parameters<typeof resolveQuotedRate>[0]> = {},
  ) =>
    resolveQuotedRate({
      quoteId: q.quoteId,
      rateId: q.rates[0]!.rateId,
      resolved: await resolveOrderLines([{ variantId, qty: 1 }]),
      postalCode: "01000",
      currency: Currency.MXN,
      ...over,
    });

  it("caso feliz: devuelve la tarifa congelable y el paquete", async () => {
    const q = await make();
    const { rate, parcel } = await resolveWith(q);
    expect(rate.amountMxn).toBe(12_000);
    expect(rate.provider).toBe("stub");
    expect(parcel.weightGrams).toBe(550);
  });

  it("409: cotización inexistente, vencida, rateId ajeno, otra cantidad, CP o moneda distintos", async () => {
    const q = await make();
    await expect(resolveWith(q, { quoteId: "inexistente" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(resolveWith(q, { rateId: "ajeno" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      resolveWith(q, { resolved: await resolveOrderLines([{ variantId, qty: 2 }]) }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(resolveWith(q, { postalCode: "99999" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(resolveWith(q, { currency: Currency.USD })).rejects.toMatchObject({ statusCode: 409 });
    await ShippingQuote.updateOne({ quoteId: q.quoteId }, { expiresAt: new Date(0) });
    await expect(resolveWith(q)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("una cotización de una cuenta no sirve para otra persona", async () => {
    const owner = await createCustomer();
    const ownerId = new mongoose.Types.ObjectId(owner.id);
    const q = await make(1, Currency.MXN, ownerId);
    await expect(resolveWith(q)).rejects.toMatchObject({ statusCode: 409 });
    await expect(resolveWith(q, { userId: ownerId })).resolves.toBeDefined();
  });
});
