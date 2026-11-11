import type { ShippingQuoteRef } from "./shipping.js";
import type { Currency } from "../enums/money.js";
import type { DisputeStatus, OrderStatus, PaymentStatus } from "../enums/orderStatus.js";
import type { OrderPriority } from "../enums/orderPriority.js";
import type { OrderStatusGroup } from "../constants/orderStatusGroups.js";
import type { AuditAction } from "../enums/auditAction.js";
import type { OrderCoupon } from "./coupon.js";
import type {
  CustomerShipment,
  OrderLabelAdmin,
  OrderTrackingAdmin,
  OrderShippingSelection,
  PublicShippingSelection,
  ShippingParcel,
} from "./shipping.js";

interface OrderCustomer {
  email: string;
  name: string;
  phone?: string;
}

interface ShippingAddress {
  recipient: string;
  line1: string;
  line2?: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface ImageAttrs {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

interface OrderLine {
  sku: string;
  productName: string;
  printName: string;
  image?: ImageAttrs;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface PublicOrder {
  publicId: string;
  /** The folio the customer reads and quotes ("GC-7KQ2M9XA"). */
  orderNumber: string;
  status: OrderStatus;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: OrderLine[];
  currency: Currency;
  subtotal: number;
  discount: number;
  shippingCost: number;
  shippingSelection?: PublicShippingSelection;
  /** The coupon as it was frozen at checkout; null without one. */
  coupon: OrderCoupon | null;
  /** IVA included in `total` (a breakdown, not an addition). */
  tax: number;
  taxRateBps: number;
  total: number;
  createdAt: Date;
  paidAt?: Date;
}

/**
 * `POST /orders/preview`: what the checkout will charge right now, computed by
 * the same chain as the order. `shippingCost` is 0 until a carrier is picked.
 */
interface CheckoutSummary {
  currency: Currency;
  subtotal: number;
  discount: number;
  shippingCost: number;
  tax: number;
  taxRateBps: number;
  total: number;
  coupon: OrderCoupon | null;
}

/** Body of `POST /orders/preview`: the coupon and the chosen rate, to price what the checkout would charge. */
interface CheckoutPreviewRequest {
  couponCode?: string;
  shippingQuote?: ShippingQuoteRef;
  /** Required with `shippingQuote`: the quote is checked against the postal code it was made for. */
  postalCode?: string;
}

/** Body of `POST /orders` for the signed-in customer's cart. Name and email come from the account. */
interface CreateCartOrderRequest {
  useCart: true;
  couponCode?: string;
  customer: { phone: string };
  shipping: ShippingAddress;
  shippingQuote: ShippingQuoteRef;
  termsAccepted: true;
}

/** `POST /orders` and `POST /orders/mine/:id/payment`: the order and the secret that finishes its payment. */
interface CreatedOrder {
  order: PublicOrder;
  clientSecret?: string;
}

/** What the OWNING customer receives ("mis órdenes"): the public view plus the internal id. */
interface CustomerOrder extends PublicOrder {
  id: string;
  /** Present only once the order is shipped or delivered. */
  shipment?: CustomerShipment;
}

interface StatusHistoryEntry {
  status: OrderStatus;
  at: Date;
  actorType: "user" | "system";
  /** Admin-only: the customer-facing DTOs never expose which employee moved an order. */
  actorId?: string;
  reason?: string;
}

interface OrderPayment {
  provider: string;
  intentId?: string;
  status: PaymentStatus;
  lastError?: string;
  capturedAt?: Date;
  /** Brand + last4 only. */
  card?: { brand: string; last4: string };
  /** Cumulative amount returned by the provider, in minor units. */
  refundedAmount?: number;
  refundedAt?: Date;
  /** Set when a refund was asked of the provider and the webhook has not confirmed it yet. */
  refundRequestedAt?: Date;
}

/**
 * The admin DTO does NOT extend the customer view as-is: `publicId` is a
 * credential (whoever holds it reads the public order page), and staff address
 * orders by `id` and `orderNumber`.
 */
interface AdminOrder extends Omit<CustomerOrder, "publicId"> {
  user?: string;
  priority: OrderPriority;
  /** Admin-only: the customer never sees their own consent record. */
  termsAcceptedAt: Date;
  cancelReason?: string;
  statusHistory: StatusHistoryEntry[];
  payment: OrderPayment;
  disputeStatus?: DisputeStatus;
  disputedAt?: Date;
  shippingSelection?: OrderShippingSelection;
  parcel?: ShippingParcel;
  label?: OrderLabelAdmin;
  tracking?: OrderTrackingAdmin;
  shippedAt?: Date;
  deliveredAt?: Date;
  updatedAt: Date;
}

interface OrderSummary {
  /** Every status, zero-filled. NOT bounded by date: a stuck order does not age out. */
  countsByStatus: Record<OrderStatus, number>;
  byGroup: Record<OrderStatusGroup, number>;
  /** Orders with an open dispute. */
  disputed: number;
}

/** "Who did what and when": the audit trail WITHOUT before/after (they can carry PII). */
interface OrderActivityEntry {
  action: AuditAction;
  actorType: "user" | "system";
  actorId?: string;
  createdAt: Date;
}

type BulkStatusOutcome = "updated" | "unchanged" | "rejected";

interface BulkStatusResult {
  results: { id: string; orderNumber: string; outcome: BulkStatusOutcome; message?: string }[];
  summary: Record<BulkStatusOutcome, number>;
}

export type {
  CheckoutPreviewRequest,
  CreateCartOrderRequest,
  CreatedOrder,
  OrderSummary,
  OrderActivityEntry,
  BulkStatusOutcome,
  BulkStatusResult,
  OrderCustomer,
  ShippingAddress,
  ImageAttrs,
  OrderLine,
  PublicOrder,
  CheckoutSummary,
  CustomerOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
};
