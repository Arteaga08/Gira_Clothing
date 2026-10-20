import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { Currency } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { createOrder } from "../../src/services/orderService.js";
import { createShippingQuote } from "../../src/services/shippingQuoteService.js";
import { Order } from "../../src/models/Order.js";
import { ShippingQuote } from "../../src/models/ShippingQuote.js";
import { Variant } from "../../src/models/Variant.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import {
  seedCatalogVariant,
  seedShippingOrigin,
  validCustomer,
  validShipping,
} from "../helpers/orders.js";

const app = buildApp();
let variantId: string;
beforeEach(async () => {
  const cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "ORDSHIP");
});

const quoteFor = async (qty = 1, currency = Currency.MXN) => {
  await seedShippingOrigin();
  return createShippingQuote(
    {
      lines: [{ variantId, qty }],
      currency,
      destination: {
        postalCode: validShipping.postalCode,
        state: validShipping.state,
        city: validShipping.city,
      },
    },
    {},
  );
};

const build = (over: Record<string, unknown> = {}) => ({
  lines: [{ variantId, qty: 1 }],
  currency: Currency.MXN,
  customer: validCustomer,
  shipping: validShipping,
  idempotencyKey: randomUUID(),
  termsAccepted: true as const,
  ...over,
});

describe("createOrder con cotización de envío", () => {
  it("congela selección, paquete y costo; el total incluye el envío elegido", async () => {
    const q = await quoteFor();
    const rate = q.rates[1]!; // la 2ª opción, no la más barata
    const { order } = await createOrder(
      build({ shippingQuote: { quoteId: q.quoteId, rateId: rate.rateId } }) as never,
      {},
    );
    expect(order.shippingCost).toBe(rate.amount);
    expect(order.total).toBe(order.subtotal + rate.amount);
    expect(order.shippingSelection).toEqual({
      carrier: rate.carrier,
      serviceName: rate.serviceName,
      estimatedDays: rate.estimatedDays,
    });
    const doc = await Order.findOne({ publicId: order.publicId }).lean();
    expect(doc?.shippingSelection.provider).toBe("stub");
    expect(doc?.shippingSelection.costMxn).toBeGreaterThan(0);
    expect(doc?.parcel.weightGrams).toBe(550);
    expect(doc?.shipping.district).toBe("Juárez");
  });

  it("rechaza con cotización vencida (409)", async () => {
    const q = await quoteFor();
    await ShippingQuote.updateOne({ quoteId: q.quoteId }, { expiresAt: new Date(0) });
    await expect(
      createOrder(
        build({ shippingQuote: { quoteId: q.quoteId, rateId: q.rates[0]!.rateId } }) as never,
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("409 si cambia la cantidad, el CP o la moneda respecto a la cotización", async () => {
    const q = await quoteFor(1);
    const sel = { quoteId: q.quoteId, rateId: q.rates[0]!.rateId };
    await expect(
      createOrder(build({ lines: [{ variantId, qty: 2 }], shippingQuote: sel }) as never, {}),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      createOrder(
        build({ shipping: { ...validShipping, postalCode: "99999" }, shippingQuote: sel }) as never,
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      createOrder(build({ currency: Currency.USD, shippingQuote: sel }) as never, {}),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("una cotización inválida no reserva stock", async () => {
    const before = await Variant.findById(variantId).lean();
    await expect(
      createOrder(build({ shippingQuote: { quoteId: "nope", rateId: "x" } }) as never, {}),
    ).rejects.toBeTruthy();
    const after = await Variant.findById(variantId).lean();
    expect(after?.reserved).toBe(before?.reserved);
  });
});

describe("POST /orders · validación del checkout", () => {
  const post = (body: Record<string, unknown>) =>
    request(app)
      .post("/api/v1/orders")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send(body);

  it("exige colonia, estado válido, CP de 5 dígitos, país MX, teléfono de 10 dígitos y cotización", async () => {
    const q = await quoteFor();
    const base = {
      lines: [{ variantId, qty: 1 }],
      currency: "MXN",
      customer: validCustomer,
      termsAccepted: true,
      shipping: validShipping,
      shippingQuote: { quoteId: q.quoteId, rateId: q.rates[0]!.rateId },
    };
    const cases: Array<Record<string, unknown>> = [
      { shipping: { ...validShipping, district: undefined } },
      { shipping: { ...validShipping, state: "Atlantis" } },
      { shipping: { ...validShipping, postalCode: "1234" } },
      { shipping: { ...validShipping, country: "US" } },
      { customer: { ...validCustomer, phone: undefined } },
      { customer: { ...validCustomer, phone: "123" } },
      { shippingQuote: undefined },
    ];
    for (const over of cases) {
      expect((await post({ ...base, ...over })).status).toBe(400);
    }
  });

  it("normaliza el teléfono (acepta espacios y guiones)", async () => {
    const q = await quoteFor();
    const res = await post({
      lines: [{ variantId, qty: 1 }],
      currency: "MXN",
      termsAccepted: true,
      customer: { ...validCustomer, phone: "55 1234-5678" },
      shipping: validShipping,
      shippingQuote: { quoteId: q.quoteId, rateId: q.rates[0]!.rateId },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order.customer.phone).toBe("5512345678");
  });
});
