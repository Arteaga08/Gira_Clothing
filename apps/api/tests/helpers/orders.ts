import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import { Currency } from "@gira/shared";
import { Variant } from "../../src/models/Variant.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { Settings, SINGLETON_KEY } from "../../src/models/Settings.js";
import {
  createOrder,
  takeCartLines,
  type CreateOrderInput,
  type OrderContext,
} from "../../src/services/orderService.js";
import { createShippingQuote } from "../../src/services/shippingQuoteService.js";
import { ORIGIN } from "./auth.js";

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

const validShipping = {
  recipient: "Ana Pérez",
  line1: "Calle Falsa 123",
  district: "Juárez",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "01000",
  country: "MX",
};

const validCustomer = { email: "cliente@example.com", name: "Ana Pérez", phone: "5512345678" };

const validOrigin = {
  name: "Gira Clothing",
  phone: "5587654321",
  line1: "Av. Reforma 100",
  district: "Juárez",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "06600",
};

/** Settings.shipping.origin is empty on a fresh database: quoting needs it. Idempotent. */
const seedShippingOrigin = async (): Promise<void> => {
  await Settings.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $set: { "shipping.origin": validOrigin }, $setOnInsert: { key: SINGLETON_KEY } },
    { upsert: true, setDefaultsOnInsert: true },
  );
};

/** A real stored quote for the cart; returns the cheapest rate in the form the checkout sends. */
const quoteRateFor = async (
  variantId: string,
  qty = 1,
  currency: Currency = Currency.MXN,
): Promise<{ quoteId: string; rateId: string }> => {
  await seedShippingOrigin();
  const quote = await createShippingQuote(
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
  return { quoteId: quote.quoteId, rateId: quote.rates[0]!.rateId };
};

/** Builds a full catalog chain through the admin API and returns the variant id. */
const seedCatalogVariant = async (
  app: Express,
  adminCookie: string,
  suffix: string,
  onHand = 10,
): Promise<string> => {
  const post = (path: string, body: Record<string, unknown>) =>
    request(app).post(path).set("Origin", ORIGIN).set("Cookie", adminCookie).send(body);

  const family = await post("/api/v1/admin/print-families", { name: `Familia ${suffix}` });
  const print = await post("/api/v1/admin/prints", {
    name: `Print ${suffix}`,
    sku: `SKU-${suffix}`,
    family: family.body.data.family.id as string,
    image: validImage,
  });
  const category = await post("/api/v1/admin/product-categories", { name: `Categoría ${suffix}` });
  const product = await post("/api/v1/admin/products", {
    name: `Producto ${suffix}`,
    category: category.body.data.category.id as string,
    basePrice: 10000,
    weightGrams: 400,
  });
  const variant = await post("/api/v1/admin/variants", {
    product: product.body.data.product.id as string,
    print: print.body.data.print.id as string,
    images: [validImage],
  });
  const variantId = variant.body.data.variant.id as string;
  await Variant.updateOne({ _id: variantId }, { $set: { onHand } });
  return variantId;
};

/** A real pending_payment order (with its reservation) created through the checkout service. */
const createPendingOrder = async (variantId: string, qty = 1): Promise<OrderDocument> => {
  const result = await createOrder(
    {
      lines: [{ variantId, qty }],
      currency: Currency.MXN,
      customer: validCustomer,
      shipping: validShipping,
      idempotencyKey: randomUUID(),
      termsAccepted: true,
      shippingQuote: await quoteRateFor(variantId, qty),
    },
    {},
  );
  const order = await Order.findOne({ publicId: result.order.publicId });
  return order!;
};

type CheckoutInput = Omit<CreateOrderInput, "shippingQuote"> &
  Partial<Pick<CreateOrderInput, "shippingQuote">>;

/** createOrder for tests that do not care about shipping: quotes the cart first, takes the cheapest rate. */
const createOrderWithQuote = async (input: CheckoutInput, ctx: OrderContext) => {
  if (input.shippingQuote) return createOrder(input as CreateOrderInput, ctx);
  const lines =
    input.lines ?? (input.useCart && ctx.userId ? await takeCartLines(ctx.userId) : []);
  await seedShippingOrigin();
  const quote = await createShippingQuote(
    {
      lines,
      currency: input.currency,
      destination: {
        postalCode: input.shipping.postalCode,
        state: input.shipping.state,
        city: input.shipping.city,
      },
    },
    { userId: ctx.userId },
  );
  return createOrder(
    { ...input, shippingQuote: { quoteId: quote.quoteId, rateId: quote.rates[0]!.rateId } },
    ctx,
  );
};

/** Same idea for HTTP bodies: adds a `shippingQuote` built from `body.lines` when it is missing. */
const withQuote = async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const shipping = body.shipping as { postalCode: string; state: string; city: string } | undefined;
  if (body.shippingQuote !== undefined || !Array.isArray(body.lines) || body.lines.length === 0 || !shipping) {
    return body;
  }
  await seedShippingOrigin();
  const quote = await createShippingQuote(
    {
      lines: body.lines as Array<{ variantId: string; qty: number }>,
      currency: (body.currency as Currency | undefined) ?? Currency.MXN,
      destination: { postalCode: shipping.postalCode, state: shipping.state, city: shipping.city },
    },
    {},
  );
  return { ...body, shippingQuote: { quoteId: quote.quoteId, rateId: quote.rates[0]!.rateId } };
};

export {
  createOrderWithQuote,
  withQuote,
  validImage,
  validShipping,
  validCustomer,
  validOrigin,
  seedShippingOrigin,
  quoteRateFor,
  seedCatalogVariant,
  createPendingOrder,
};
