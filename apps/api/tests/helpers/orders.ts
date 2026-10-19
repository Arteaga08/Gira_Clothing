import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import { Currency } from "@gira/shared";
import { Variant } from "../../src/models/Variant.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { createOrder } from "../../src/services/orderService.js";
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
  city: "CDMX",
  state: "CDMX",
  postalCode: "01000",
  country: "MX",
};

const validCustomer = { email: "cliente@example.com", name: "Ana Pérez" };

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
    },
    {},
  );
  const order = await Order.findOne({ publicId: result.order.publicId });
  return order!;
};

export { validImage, validShipping, validCustomer, seedCatalogVariant, createPendingOrder };
