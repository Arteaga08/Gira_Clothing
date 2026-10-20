import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import {
  CANCEL_REASON_MAX,
  Currency,
  DisputeStatus,
  OrderPriority,
  PriceRounding,
  OrderStatus,
  PaymentStatus,
  ShippingCarrier,
  ShippingLabelStatus,
  ShippingProviderName,
} from "@gira/shared";
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
  /** Colonia: carriers require it to route the parcel. */
  district: string;
  city: string;
  state: string;
  postalCode: string;
  /** ISO-3166 alpha-2. */
  country: string;
}

interface OrderCustomer {
  email: string;
  name: string;
  /** Ten digits: the carrier contacts the recipient with it. */
  phone: string;
}

interface OrderPayment {
  provider: string;
  intentId?: string;
  status: PaymentStatus;
  lastError?: string;
  /** Cumulative amount the provider returned, minor units. Overwritten (never summed) from the provider. */
  refundedAmount?: number;
  refundedAt?: Date;
  /** When the provider took the money. */
  capturedAt?: Date;
  /** Brand + last4 ONLY (PCI SAQ-A): nothing here is enough to charge the card again. */
  card?: { brand: string; last4: string };
}

interface ShippingSelectionAttrs {
  provider: ShippingProviderName;
  carrier: ShippingCarrier;
  service: string;
  serviceName: string;
  estimatedDays: number;
  /** Charged to the customer, MXN centavos (0 when free). */
  amountMxn: number;
  /** Quoted to us by the provider, MXN centavos. */
  costMxn: number;
}

interface ParcelAttrs {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

interface OrderLabel {
  status: ShippingLabelStatus;
  attempts: number;
  nextAttemptAt?: Date;
  requestedAt?: Date;
  providerShipmentId?: string;
  trackingNumber?: string;
  carrier?: ShippingCarrier;
  labelUrl?: string;
  trackUrl?: string;
  /** What the provider charged us for the label, MXN centavos. */
  costMxn?: number;
  lastError?: string;
  readyAt?: Date;
  cancelAttempts: number;
  cancelledAt?: Date;
  /** Cancel the current label and buy a fresh one (address corrected). */
  requeueAfterCancel?: boolean;
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
  /** Human folio ("GC-7KQ2M9XA"). The credential is publicId; this is only a label. */
  orderNumber: string;
  user?: Types.ObjectId;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: OrderLineSnapshot[];
  currency: Currency;
  exchangeRate: number;
  rounding: PriceRounding;
  subtotal: number;
  discount: number;
  shippingCost: number;
  /** The carrier option the customer picked, frozen at checkout. */
  shippingSelection: ShippingSelectionAttrs;
  parcel: ParcelAttrs;
  /** IVA included in `total` (a breakdown, not an addition). */
  tax: number;
  /** Rate used to derive `tax`, frozen so a later Settings change never rewrites a past order. */
  taxRateBps: number;
  total: number;
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  payment: OrderPayment;
  idempotencyKey: string;
  /** Server-stamped when checkout is accepted. Admin-only: never in a customer DTO. */
  termsAcceptedAt: Date;
  /** Why the order was cancelled: a system code or the admin's free-text reason. */
  cancelReason?: string;
  /** Triage only: never conditions a transition, only where the order sorts in the queue. */
  priority: OrderPriority;
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
  /** The purchased shipping label. Absent until the order is paid. */
  label?: OrderLabel;
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
    district: { type: String, required: true, trim: true },
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
    phone: { type: String, required: true, trim: true },
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
    capturedAt: { type: Date },
    card: {
      type: new Schema(
        {
          brand: { type: String, trim: true, maxlength: 30, required: true },
          last4: { type: String, trim: true, match: /^\d{4}$/, required: true },
        },
        { _id: false },
      ),
    },
  },
  { _id: false },
);

const shippingSelectionSchema = new Schema<ShippingSelectionAttrs>(
  {
    provider: { type: String, enum: Object.values(ShippingProviderName), required: true },
    carrier: { type: String, enum: Object.values(ShippingCarrier), required: true },
    service: { type: String, required: true },
    serviceName: { type: String, required: true },
    estimatedDays: { type: Number, required: true, min: 0 },
    amountMxn: { type: Number, required: true, min: 0 },
    costMxn: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const parcelSchema = new Schema<ParcelAttrs>(
  {
    weightGrams: { type: Number, required: true, min: 1 },
    lengthCm: { type: Number, required: true, min: 1 },
    widthCm: { type: Number, required: true, min: 1 },
    heightCm: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const orderLabelSchema = new Schema<OrderLabel>(
  {
    status: { type: String, enum: Object.values(ShippingLabelStatus), required: true },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    nextAttemptAt: { type: Date },
    requestedAt: { type: Date },
    providerShipmentId: { type: String },
    trackingNumber: { type: String },
    carrier: { type: String, enum: Object.values(ShippingCarrier) },
    labelUrl: { type: String },
    trackUrl: { type: String },
    costMxn: { type: Number, min: 0 },
    lastError: { type: String, maxlength: 500 },
    readyAt: { type: Date },
    cancelAttempts: { type: Number, required: true, min: 0, default: 0 },
    cancelledAt: { type: Date },
    requeueAfterCancel: { type: Boolean },
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
    orderNumber: { type: String, required: true, uppercase: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    customer: { type: orderCustomerSchema, required: true },
    shipping: { type: shippingAddressSchema, required: true },
    lines: { type: [orderLineSchema], required: true },
    currency: { type: String, enum: Object.values(Currency), required: true },
    exchangeRate: { type: Number, required: true, min: 1 },
    rounding: { type: String, enum: Object.values(PriceRounding), required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    shippingCost: { type: Number, required: true, min: 0 },
    shippingSelection: { type: shippingSelectionSchema, required: true },
    parcel: { type: parcelSchema, required: true },
    tax: { type: Number, required: true, min: 0 },
    taxRateBps: { type: Number, required: true, min: 0, max: 10000 },
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
    termsAcceptedAt: { type: Date, required: true },
    cancelReason: { type: String, trim: true, maxlength: CANCEL_REASON_MAX },
    priority: { type: String, enum: Object.values(OrderPriority), default: OrderPriority.NORMAL },
    paidAt: { type: Date },
    disputeStatus: { type: String, enum: Object.values(DisputeStatus) },
    disputedAt: { type: Date },
    stockCommittedAt: { type: Date },
    fulfillmentStartedAt: { type: Date },
    fromCart: { type: Boolean },
    paidEffectsAt: { type: Date },
    label: { type: orderLabelSchema },
  },
  { timestamps: true },
);

// The capability lookup: GET /orders/:publicId.
orderSchema.index({ publicId: 1 }, { unique: true });
// The human folio: exact lookup from the panel and the unique guard against collisions.
orderSchema.index({ orderNumber: 1 }, { unique: true });
// Operator queue: priority first, then status, newest first.
orderSchema.index({ priority: 1, status: 1, createdAt: -1 });
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
// Label job: due purchases and cancellations. Partial: most orders never have a pending label.
orderSchema.index(
  { "label.status": 1, "label.nextAttemptAt": 1 },
  { partialFilterExpression: { "label.status": { $type: "string" } } },
);
// A tracking number belongs to exactly one order (also guards a duplicate purchase).
orderSchema.index(
  { "label.trackingNumber": 1 },
  { unique: true, partialFilterExpression: { "label.trackingNumber": { $type: "string" } } },
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
  ShippingSelectionAttrs,
  ParcelAttrs,
  OrderLabel,
};
export { Order };
