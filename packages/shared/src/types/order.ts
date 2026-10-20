import type { Currency } from "../enums/money.js";
import type { DisputeStatus, OrderStatus, PaymentStatus } from "../enums/orderStatus.js";
import type { OrderPriority } from "../enums/orderPriority.js";
import type { OrderStatusGroup } from "../constants/orderStatusGroups.js";
import type { AuditAction } from "../enums/auditAction.js";
import type {
  OrderLabelAdmin,
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
  /** IVA included in `total` (a breakdown, not an addition). */
  tax: number;
  taxRateBps: number;
  total: number;
  createdAt: Date;
  paidAt?: Date;
}

/** What the OWNING customer receives ("mis órdenes"): the public view plus the internal id. */
interface CustomerOrder extends PublicOrder {
  id: string;
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
}

interface AdminOrder extends CustomerOrder {
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
  OrderSummary,
  OrderActivityEntry,
  BulkStatusOutcome,
  BulkStatusResult,
  OrderCustomer,
  ShippingAddress,
  ImageAttrs,
  OrderLine,
  PublicOrder,
  CustomerOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
};
