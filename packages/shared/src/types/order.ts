import type { Currency } from "../enums/money.js";
import type { OrderStatus, PaymentStatus } from "../enums/orderStatus.js";

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

interface StatusHistoryEntry {
  status: OrderStatus;
  at: Date;
  reason?: string;
}

interface OrderPayment {
  provider: string;
  intentId?: string;
  status: PaymentStatus;
  lastError?: string;
}

interface AdminOrder extends PublicOrder {
  user?: string;
  statusHistory: StatusHistoryEntry[];
  payment: OrderPayment;
  updatedAt: Date;
}

export type {
  OrderCustomer,
  ShippingAddress,
  ImageAttrs,
  OrderLine,
  PublicOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
};
