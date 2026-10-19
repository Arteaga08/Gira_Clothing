import mongoose from "mongoose";
import {
  Currency,
  DisputeStatus,
  OrderPriority,
  OrderStatus,
  PaymentStatus,
  PriceRounding,
} from "@gira/shared";
import { Order } from "../../src/models/Order.js";
import { generateOrderNumber } from "../../src/utils/orderNumber.js";

interface SeedOrderOptions {
  status: OrderStatus;
  total: number;
  currency?: Currency;
  createdAt: Date;
  qty?: number;
  priority?: OrderPriority;
  orderNumber?: string;
  email?: string;
  name?: string;
  phone?: string;
  disputeStatus?: DisputeStatus;
}

/**
 * Direct Order.create fixture for M5 tests ONLY — lifted from the shape
 * orderStats.test.ts already uses. Kept separate so this file's tests never
 * risk the green suite of orderStats.test.ts / statsOverview.test.ts.
 */
const seedOrder = async (opts: SeedOrderOptions): Promise<mongoose.Types.ObjectId> => {
  const variant = new mongoose.Types.ObjectId();
  const product = new mongoose.Types.ObjectId();
  const qty = opts.qty ?? 1;
  const currency = opts.currency ?? Currency.MXN;

  const doc = await Order.create({
    publicId: new mongoose.Types.ObjectId().toHexString() + "x".repeat(20),
    orderNumber: opts.orderNumber ?? generateOrderNumber(),
    tax: 0,
    taxRateBps: 1600,
    termsAcceptedAt: new Date(),
    customer: {
      email: opts.email ?? "cliente@example.com",
      name: opts.name ?? "Ana Pérez",
      ...(opts.phone ? { phone: opts.phone } : {}),
    },
    shipping: {
      recipient: "Ana Pérez",
      line1: "Calle Falsa 123",
      city: "CDMX",
      state: "CDMX",
      postalCode: "01000",
      country: "MX",
    },
    lines: [
      {
        variant,
        product,
        sku: `SKU-${variant.toHexString().slice(-6)}`,
        productName: "Tote",
        printName: "Amapolas",
        qty,
        unitPriceMxn: opts.total,
        unitPrice: opts.total,
        lineTotal: opts.total,
      },
    ],
    currency,
    exchangeRate: 1,
    rounding: PriceRounding.NONE,
    subtotal: opts.total,
    shippingCost: 0,
    total: opts.total,
    status: opts.status,
    statusHistory: [{ status: opts.status, at: opts.createdAt }],
    payment: { provider: "stripe", status: PaymentStatus.SUCCEEDED },
    idempotencyKey: new mongoose.Types.ObjectId().toHexString(),
    ...(opts.priority ? { priority: opts.priority } : {}),
    ...(opts.disputeStatus ? { disputeStatus: opts.disputeStatus, disputedAt: new Date() } : {}),
  });

  // `createdAt` is marked `immutable: true` by Mongoose's timestamps plugin,
  // so a Mongoose-level update silently strips it from $set regardless of
  // { timestamps: false }. Going through the native driver (Order.collection)
  // skips that casting entirely — the same trick orderStats.test.ts uses to
  // fake history.
  await Order.collection.updateOne({ _id: doc._id }, { $set: { createdAt: opts.createdAt } });
  return doc._id;
};

export { seedOrder };
export type { SeedOrderOptions };
