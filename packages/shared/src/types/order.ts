import type { Currency } from "../enums/money.js";
import type { DisputeStatus, OrderStatus, PaymentStatus } from "../enums/orderStatus.js";

interface OrderCustomer {
  email: string;
  name: string;
  phone?: string;
}

interface ShippingAddress {
  recipient: string;
  line1: string;
  line2?: string;
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
  status: OrderStatus;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: OrderLine[];
  currency: Currency;
  subtotal: number;
  shippingCost: number;
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
  /** Cumulative amount returned by the provider, in minor units. */
  refundedAmount?: number;
  refundedAt?: Date;
}

interface AdminOrder extends CustomerOrder {
  user?: string;
  statusHistory: StatusHistoryEntry[];
  payment: OrderPayment;
  disputeStatus?: DisputeStatus;
  disputedAt?: Date;
  updatedAt: Date;
}

export type {
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
