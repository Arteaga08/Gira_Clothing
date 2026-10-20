import {
  Currency,
  OrderPriority,
  OrderStatus,
  PaymentStatus,
  ShippingCarrier,
  ShippingLabelStatus,
  type AdminOrder,
  type Wire,
} from "@gira/shared";
import { toPanelOrder, type PanelOrder, type RawAdminOrder } from "@/lib/orders/panelOrder";

const DEFAULT_ID = "68f2ab12c3d4e5f6a7b8c9d0";

/** Sentinel: the publicId is a credential and must never reach the DOM. */
const PUBLIC_ID_SENTINEL = "PUBLIC-ID-SECRETO-NO-MOSTRAR";
const USER_ID_SENTINEL = "USER-ID-INTERNO-NO-MOSTRAR";
const ACTOR_ID_SENTINEL = "ACTOR-ID-INTERNO-NO-MOSTRAR";

type OrderOverrides = Partial<PanelOrder>;

/**
 * An admin order as the API sends it, plus a leaked credential (`publicId`, which the API no longer
 * sends) to prove the panel drops it, the internal `user` id and the `statusHistory` it must never keep.
 * Only API-client tests use this; components receive `makeOrder` (a PanelOrder).
 */
const makeRawOrder = (overrides: Partial<RawAdminOrder> = {}): RawAdminOrder => ({
  id: DEFAULT_ID,
  publicId: PUBLIC_ID_SENTINEL,
  user: USER_ID_SENTINEL,
  orderNumber: "GC-7KQ3M2XV",
  status: OrderStatus.PAID,
  priority: OrderPriority.NORMAL,
  customer: { email: "ana.ruiz@example.com", name: "Ana Sofía Ruiz", phone: "5598765432" },
  shipping: {
    recipient: "Ana Sofía Ruiz",
    line1: "Av. Chapultepec 1247",
    line2: "Int. 4B",
    district: "Americana",
    city: "Guadalajara",
    state: "JC",
    postalCode: "44160",
    country: "MX",
  },
  lines: [
    { sku: "PLY-CEMP-M", productName: "Playera oversize", printName: "Cempasúchil", qty: 1, unitPrice: 45000, lineTotal: 45000 },
    { sku: "TOT-OLAG-U", productName: "Tote bag de lona", printName: "Ola Grande", qty: 2, unitPrice: 31000, lineTotal: 62000 },
  ],
  currency: Currency.MXN,
  subtotal: 107000,
  discount: 0,
  shippingCost: 5000,
  tax: 14759,
  taxRateBps: 1600,
  total: 112000,
  createdAt: "2026-10-19T15:14:00.000Z",
  paidAt: "2026-10-19T15:15:00.000Z",
  updatedAt: "2026-10-19T15:15:00.000Z",
  termsAcceptedAt: "2026-10-19T15:13:00.000Z",
  statusHistory: [{ status: OrderStatus.PAID, at: "2026-10-19T15:15:00.000Z", actorType: "user", actorId: ACTOR_ID_SENTINEL }],
  payment: {
    provider: "stripe",
    intentId: "pi_3Qk8Xa",
    status: PaymentStatus.SUCCEEDED,
    capturedAt: "2026-10-19T15:15:00.000Z",
    card: { brand: "Visa", last4: "4242" },
  },
  shippingSelection: {
    provider: "stub" as never,
    carrier: ShippingCarrier.DHL,
    service: "express",
    serviceName: "DHL Express",
    estimatedDays: 3,
    amountMxn: 5000,
    costMxn: 4200,
  },
  label: {
    status: ShippingLabelStatus.READY,
    attempts: 1,
    trackingNumber: "5012345678",
    carrier: ShippingCarrier.DHL,
    labelUrl: "https://labels.example.com/5012345678.pdf",
    trackUrl: "https://track.example.com/5012345678",
  },
  ...overrides,
});

/** A component-ready order: the raw API shape with the sensitive fields already stripped. */
const makeOrder = (overrides: OrderOverrides = {}): PanelOrder =>
  toPanelOrder({ ...makeRawOrder(), ...(overrides as Partial<Wire<AdminOrder>>) });

const orderOf = (status: OrderStatus, overrides: OrderOverrides = {}): PanelOrder =>
  makeOrder({ status, ...overrides });

/** Drops optional fields (exactOptionalPropertyTypes forbids setting them to undefined). */
const without = (order: PanelOrder, ...keys: (keyof PanelOrder)[]): PanelOrder => {
  const copy = { ...order };
  keys.forEach((key) => delete copy[key]);
  return copy;
};

const withoutIntent = (order: PanelOrder): PanelOrder => {
  const payment = { ...order.payment };
  delete payment.intentId;
  return { ...order, payment };
};

export {
  makeOrder,
  makeRawOrder,
  orderOf,
  without,
  withoutIntent,
  PUBLIC_ID_SENTINEL,
  USER_ID_SENTINEL,
  ACTOR_ID_SENTINEL,
  DEFAULT_ID,
};
