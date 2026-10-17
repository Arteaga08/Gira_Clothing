import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { Currency, DisputeStatus, PriceRounding, OrderStatus, PaymentStatus } from "@gira/shared";
import { imageSchema, type ImageAttrs } from "./schemas/image.js";

/**
 * Immutable purchase record. Every line freezes the exact price charged, in
 * both MXN and the charge currency, plus the exchange rate and rounding mode
 * in force at that moment. The order NEVER re-reads the catalog to display
 * itself: a price change tomorrow must not rewrite what someone paid today.
 *
 * `publicId` is a CSPRNG capability (anti-IDOR): whoever holds it may read the
 * order. `idempotencyKey` is unique so a double-click or a network retry can
 * never create a second order — or a second charge — for the same intent.
 *
 * There is no `payment_failed` order status: Stripe lets the customer retry a
 * failed intent, so a failure lives in `payment.status` while the order waits
 * (see OrderStatus in @gira/shared).
 */

interface OrderLineSnapshot {
  variant: Types.ObjectId;
  product: Types.ObjectId;
  sku: string;
  productName: string;
  printName: string;
  image?: ImageAttrs;
  qty: number;
  /** Captured price in MXN centavos — the source of truth regardless of charge currency. */
  unitPriceMxn: number;
  /** Price actually charged, in `currency` below. */
  unitPrice: number;
  lineTotal: number;
}

interface ShippingAddress {
  recipient: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  /** ISO-3166 alpha-2. */
  country: string;
}

interface OrderCustomer {
  email: string;
  name: string;
  phone?: string;
}

interface OrderPayment {
  provider: string;
  intentId?: string;
  status: PaymentStatus;
  lastError?: string;
  /** Cumulative amount the provider returned, minor units. Overwritten (never summed) from the provider. */
  refundedAmount?: number;
  refundedAt?: Date;
}

interface StatusHistoryEntry {
  status: OrderStatus;
  at: Date;
  actorType: "user" | "system";
  actorId?: Types.ObjectId;
  reason?: string;
}

interface OrderAttrs {
  publicId: string;
  user?: Types.ObjectId;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: OrderLineSnapshot[];
  currency: Currency;
  exchangeRate: number;
  rounding: PriceRounding;
  subtotal: number;
  shippingCost: number;
  total: number;
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  payment: OrderPayment;
  idempotencyKey: string;
  paidAt?: Date;
  /**
   * Chargeback lifecycle. Lives on the order, NOT in `status`: a dispute does
   * not move the sale through fulfillment, and a lost one is not a refund.
   */
  disputeStatus?: DisputeStatus;
  disputedAt?: Date;
  /**
   * Set once when the stock reservation is committed. Persisted because the
   * reservation itself is purged 30 days after it settles, and a late refund
   * must still know whether units really left stock.
   */
  stockCommittedAt?: Date;
  /**
   * Set once, by applyOrderTransition, the first time the order enters
   * processing/shipped/delivered. statusHistory is capped, so it cannot answer
   * "did this order ever leave the warehouse?" reliably.
   */
  fulfillmentStartedAt?: Date;
  /** Internal: the order was built from the customer's cart, which is emptied once it is PAID. */
  fromCart?: boolean;
  /**
   * Set once every effect of a payment (stock commit, notifications, cart) has
   * run. A paid order without it is one whose effects died halfway; the
   * reconciliation job picks those up.
   */
  paidEffectsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type OrderModel = Model<OrderAttrs>;
type OrderDocument = HydratedDocument<OrderAttrs>;

const orderLineSchema = new Schema<OrderLineSnapshot>(
  {
    variant: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true },
    productName: { type: String, required: true },
    printName: { type: String, required: true },
    image: { type: imageSchema },
    qty: { type: Number, required: true, min: 1 },
    unitPriceMxn: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const shippingAddressSchema = new Schema<ShippingAddress>(
  {
    recipient: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, uppercase: true, trim: true, minlength: 2, maxlength: 2 },
  },
  { _id: false },
);

const orderCustomerSchema = new Schema<OrderCustomer>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
  },
  { _id: false },
);

const orderPaymentSchema = new Schema<OrderPayment>(
  {
    provider: { type: String, required: true },
    intentId: { type: String },
    status: { type: String, enum: Object.values(PaymentStatus), required: true },
    lastError: { type: String },
    refundedAmount: { type: Number, min: 0 },
    refundedAt: { type: Date },
  },
  { _id: false },
);

const statusHistorySchema = new Schema<StatusHistoryEntry>(
  {
    status: { type: String, enum: Object.values(OrderStatus), required: true },
    at: { type: Date, required: true },
    // Defaulted so entries written before this field existed still validate.
    actorType: { type: String, enum: ["user", "system"], default: "system" },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    reason: { type: String },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderAttrs, OrderModel>(
  {
    publicId: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    customer: { type: orderCustomerSchema, required: true },
    shipping: { type: shippingAddressSchema, required: true },
    lines: { type: [orderLineSchema], required: true },
    currency: { type: String, enum: Object.values(Currency), required: true },
    exchangeRate: { type: Number, required: true, min: 1 },
    rounding: { type: String, enum: Object.values(PriceRounding), required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingCost: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      required: true,
      default: OrderStatus.PENDING_PAYMENT,
    },
    statusHistory: { type: [statusHistorySchema], default: [] },
    payment: { type: orderPaymentSchema, required: true },
    idempotencyKey: { type: String, required: true },
    paidAt: { type: Date },
    disputeStatus: { type: String, enum: Object.values(DisputeStatus) },
    disputedAt: { type: Date },
    stockCommittedAt: { type: Date },
    fulfillmentStartedAt: { type: Date },
    fromCart: { type: Boolean },
    paidEffectsAt: { type: Date },
  },
  { timestamps: true },
);

// The capability lookup: GET /orders/:publicId.
orderSchema.index({ publicId: 1 }, { unique: true });
// Idempotent creation: the unique index IS the guarantee, not the pre-check.
orderSchema.index({ idempotencyKey: 1 }, { unique: true });
// "My orders" panel.
orderSchema.index({ user: 1, createdAt: -1 });
// Admin listing + the reconciliation job's scan for stale pending orders.
orderSchema.index({ status: 1, createdAt: 1 });
// Admin search by customer.
orderSchema.index({ "customer.email": 1, createdAt: -1 });
// The webhook's only lookup. Unique => one payment can never be claimed by two
// orders. Partial (not unique+sparse) so orders that have not reached the
// provider yet are not all treated as duplicates of each other.
orderSchema.index(
  { "payment.intentId": 1 },
  { unique: true, partialFilterExpression: { "payment.intentId": { $type: "string" } } },
);
// Backs the "disputas abiertas" alert count. Partial: almost every order never
// has a dispute, so the index stays tiny.
orderSchema.index(
  { disputeStatus: 1 },
  { partialFilterExpression: { disputeStatus: { $type: "string" } } },
);
// Timeseries aggregation scans the whole range by createdAt regardless of status.
orderSchema.index({ createdAt: -1 });

const Order = model<OrderAttrs, OrderModel>("Order", orderSchema);

export type {
  OrderAttrs,
  OrderDocument,
  OrderLineSnapshot,
  ShippingAddress,
  OrderCustomer,
  OrderPayment,
  StatusHistoryEntry,
};
export { Order };
