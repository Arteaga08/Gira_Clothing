import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import {
  Currency,
  DisputeStatus,
  OrderPriority,
  OrderStatus,
  PaymentStatus,
  PriceRounding,
  ShipmentTrackingStatus,
  ShippingCarrier,
  ShippingProviderName,
} from "@gira/shared";
import { convertFromMxn } from "../../utils/money.js";
import { generateOrderNumber } from "../../utils/orderNumber.js";
import { splitTax } from "../../utils/orderTax.js";
import { generatePublicId } from "../../utils/publicId.js";
import { ADDRESSES, DEMO_EMAIL_SUFFIX, FIRST_NAMES, LAST_NAMES } from "./peopleData.js";
import type { Random } from "./random.js";

/**
 * Builds demo orders as plain documents (validated by the caller against the
 * Order schema). They are deliberately INERT for the background jobs: no
 * `pending_payment` (reconcilePayments), no label (processShippingLabels,
 * reconcileTracking), and every paid order carries `paidEffectsAt`. Nothing
 * here can make the API call Stripe or Envía.
 */

interface SellableVariant {
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  sku: string;
  productName: string;
  printName: string;
  unitPriceMxn: number;
  weightGrams: number;
}

interface DemoBuyer {
  userId: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
}

interface BuildOrdersInput {
  random: Random;
  now: Date;
  count: number;
  days: number;
  variants: SellableVariant[];
  buyers: DemoBuyer[];
  /** Admin who moved orders by hand in the history; system when absent. */
  adminId: Types.ObjectId | undefined;
  taxRateBps: number;
  mxnPerUsdCents: number;
}

type DemoOrder = Record<string, unknown> & { createdAt: Date; updatedAt: Date };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FREE_SHIPPING_FROM_MXN = 150_000;
const SHIPPING_MXN = 14_900;
const TARE_GRAMS = 150;
const CARRIERS = [ShippingCarrier.ESTAFETA, ShippingCarrier.FEDEX, ShippingCarrier.DHL, ShippingCarrier.PAQUETEXPRESS];
const CARD_BRANDS = ["visa", "mastercard", "amex"];
const CANCEL_REASON = "El cliente pidió cancelar antes de pagar.";

const asciiLower = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const phoneOf = (random: Random): string => `55${String(random.int(10_000_000, 99_999_999))}`;

const guestOf = (random: Random, index: number): Omit<DemoBuyer, "userId"> => {
  const first = random.pick(FIRST_NAMES);
  const last = random.pick(LAST_NAMES);
  return {
    name: `${first} ${last}`,
    email: `${asciiLower(first)}.${asciiLower(last)}${index}${DEMO_EMAIL_SUFFIX}`,
    phone: phoneOf(random),
  };
};

/** Ends where an order of that age would plausibly be; a few fall out of the happy path. */
const pickStatus = (random: Random, ageDays: number): OrderStatus => {
  const roll = random.next();
  if (roll < 0.1) return OrderStatus.EXPIRED;
  if (roll < 0.16) return OrderStatus.CANCELLED;
  if (roll < 0.21 && ageDays > 3) return OrderStatus.REFUNDED;
  if (ageDays < 1.5) return random.chance(0.6) ? OrderStatus.PAID : OrderStatus.PROCESSING;
  if (ageDays < 4) return random.chance(0.4) ? OrderStatus.PROCESSING : OrderStatus.SHIPPED;
  if (ageDays < 8) return random.chance(0.5) ? OrderStatus.SHIPPED : OrderStatus.DELIVERED;
  return OrderStatus.DELIVERED;
};

const buildLines = (random: Random, variants: SellableVariant[], currency: Currency, rate: number) =>
  random.sample(variants, random.int(1, 3)).map((variant) => {
    const qty = random.chance(0.2) ? 2 : 1;
    const unitPrice = convertFromMxn(variant.unitPriceMxn, currency, rate, PriceRounding.UP_TO_50_CENTS);
    return {
      line: {
        variant: variant.variantId,
        product: variant.productId,
        sku: variant.sku,
        productName: variant.productName,
        printName: variant.printName,
        qty,
        unitPriceMxn: variant.unitPriceMxn,
        unitPrice,
        lineTotal: unitPrice * qty,
      },
      weightGrams: variant.weightGrams * qty,
      units: qty,
    };
  });

const buildDemoOrders = (input: BuildOrdersInput): DemoOrder[] => {
  const { random, now, variants, buyers, adminId } = input;
  const nowMs = now.getTime();
  const at = (ms: number): Date => new Date(Math.min(ms, nowMs - 60_000));
  const byHand = adminId ? { actorType: "user" as const, actorId: adminId } : { actorType: "system" as const };
  const orders: DemoOrder[] = [];

  for (let i = 0; i < input.count; i += 1) {
    // Squared: more orders in recent weeks, like a store that is growing.
    const ageDays = input.days * random.next() ** 1.6;
    const created = nowMs - ageDays * DAY;
    const status = pickStatus(random, ageDays);
    const currency = random.chance(0.15) ? Currency.USD : Currency.MXN;
    const rate = currency === Currency.USD ? input.mxnPerUsdCents : 1;

    // A few loyal buyers order often (the ranking needs a top 10); a third are guests.
    const registered = random.chance(0.65);
    const buyer = registered
      ? (buyers[Math.floor(buyers.length * random.next() ** 2)] as DemoBuyer)
      : { ...guestOf(random, i), userId: undefined };

    const built = buildLines(random, variants, currency, rate);
    const lines = built.map((entry) => entry.line);
    const subtotalMxn = lines.reduce((sum, line) => sum + line.unitPriceMxn * line.qty, 0);
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const shippingMxn = subtotalMxn >= FREE_SHIPPING_FROM_MXN ? 0 : SHIPPING_MXN;
    const shippingCost = convertFromMxn(shippingMxn, currency, rate, PriceRounding.UP_TO_50_CENTS);
    const total = subtotal + shippingCost;
    const units = built.reduce((sum, entry) => sum + entry.units, 0);
    const express = random.chance(0.3);

    const paid = ![OrderStatus.EXPIRED, OrderStatus.CANCELLED].includes(status);
    const paidAt = at(created + random.int(5, 40) * 60_000);
    const processingAt = at(created + random.int(6, 26) * HOUR);
    const shippedAt = at(created + random.int(30, 60) * HOUR);
    const deliveredAt = at(shippedAt.getTime() + random.int(2, 4) * DAY);
    const reach = (target: OrderStatus): boolean => {
      const order = [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
      const effective = status === OrderStatus.REFUNDED ? OrderStatus.PROCESSING : status;
      return order.indexOf(effective) >= order.indexOf(target);
    };

    const history: Record<string, unknown>[] = [{ status: OrderStatus.PENDING_PAYMENT, at: new Date(created), actorType: "system" }];
    if (status === OrderStatus.EXPIRED) history.push({ status, at: at(created + 30 * 60_000), actorType: "system" });
    if (status === OrderStatus.CANCELLED) history.push({ status, at: at(created + 15 * 60_000), ...byHand, reason: CANCEL_REASON });
    if (paid) history.push({ status: OrderStatus.PAID, at: paidAt, actorType: "system" });
    if (paid && reach(OrderStatus.PROCESSING)) history.push({ status: OrderStatus.PROCESSING, at: processingAt, ...byHand });
    if (reach(OrderStatus.SHIPPED)) history.push({ status: OrderStatus.SHIPPED, at: shippedAt, ...byHand });
    if (reach(OrderStatus.DELIVERED)) history.push({ status: OrderStatus.DELIVERED, at: deliveredAt, actorType: "system" });
    const refundedAt = at(processingAt.getTime() + random.int(10, 40) * HOUR);
    if (status === OrderStatus.REFUNDED) history.push({ status, at: refundedAt, ...byHand });

    const lastAt = (history[history.length - 1] as { at: Date }).at;
    const address = random.pick(ADDRESSES);
    const payment: Record<string, unknown> = {
      provider: "stripe",
      intentId: `pi_demo_${randomBytes(12).toString("hex")}`,
      status: paid
        ? status === OrderStatus.REFUNDED
          ? PaymentStatus.REFUNDED
          : PaymentStatus.SUCCEEDED
        : PaymentStatus.CANCELLED,
    };
    if (paid) {
      payment.capturedAt = paidAt;
      payment.card = { brand: random.pick(CARD_BRANDS), last4: String(random.int(1000, 9999)) };
    }
    if (status === OrderStatus.REFUNDED) {
      payment.refundRequestedAt = refundedAt;
      payment.refundedAt = refundedAt;
      payment.refundedAmount = total;
    }

    const order: DemoOrder = {
      publicId: generatePublicId(),
      orderNumber: generateOrderNumber(),
      ...(buyer.userId ? { user: buyer.userId } : {}),
      customer: { email: buyer.email, name: buyer.name, phone: buyer.phone },
      shipping: { recipient: buyer.name, ...address, country: "MX" },
      lines,
      currency,
      exchangeRate: currency === Currency.USD ? input.mxnPerUsdCents : 1,
      rounding: currency === Currency.USD ? PriceRounding.UP_TO_50_CENTS : PriceRounding.NONE,
      subtotal,
      discount: 0,
      shippingCost,
      shippingSelection: {
        provider: ShippingProviderName.ENVIA,
        carrier: random.pick(CARRIERS),
        service: express ? "express" : "standard",
        serviceName: express ? "Express" : "Estándar",
        estimatedDays: express ? 2 : 4,
        amountMxn: shippingMxn,
        costMxn: random.int(11_000, 16_000),
      },
      parcel: {
        weightGrams: TARE_GRAMS + built.reduce((sum, entry) => sum + entry.weightGrams, 0),
        lengthCm: 30,
        widthCm: 25,
        heightCm: Math.min(40, 5 + 3 * (units - 1)),
      },
      tax: splitTax(total, input.taxRateBps).tax,
      taxRateBps: input.taxRateBps,
      total,
      status,
      statusHistory: history,
      payment,
      idempotencyKey: randomBytes(16).toString("hex"),
      termsAcceptedAt: new Date(created),
      priority:
        (status === OrderStatus.PAID || status === OrderStatus.PROCESSING) && random.chance(0.25)
          ? random.pick([OrderPriority.HIGH, OrderPriority.HIGH, OrderPriority.URGENT])
          : OrderPriority.NORMAL,
      fromCart: false,
      ...(status === OrderStatus.CANCELLED ? { cancelReason: CANCEL_REASON } : {}),
      ...(paid ? { paidAt, paidEffectsAt: paidAt, stockCommittedAt: paidAt } : {}),
      ...(paid && reach(OrderStatus.PROCESSING) ? { fulfillmentStartedAt: processingAt } : {}),
      ...(reach(OrderStatus.SHIPPED)
        ? {
            shippedAt,
            tracking: {
              status: reach(OrderStatus.DELIVERED) ? ShipmentTrackingStatus.DELIVERED : ShipmentTrackingStatus.IN_TRANSIT,
              lastEventAt: reach(OrderStatus.DELIVERED) ? deliveredAt : shippedAt,
            },
          }
        : {}),
      ...(reach(OrderStatus.DELIVERED) ? { deliveredAt } : {}),
      createdAt: new Date(created),
      updatedAt: lastAt,
    };
    orders.push(order);
  }

  // Two chargebacks on delivered orders: one still open, one lost.
  const delivered = orders.filter((order) => order.status === OrderStatus.DELIVERED);
  [DisputeStatus.OPEN, DisputeStatus.LOST].forEach((disputeStatus, index) => {
    const target = delivered[index * 7];
    if (!target) return;
    target.disputeStatus = disputeStatus;
    target.disputedAt = at((target.deliveredAt as Date).getTime() + 3 * DAY);
  });

  return orders;
};

export type { SellableVariant, DemoBuyer, BuildOrdersInput, DemoOrder };
export { buildDemoOrders };
