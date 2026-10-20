import { SHIPPING_CARRIER_LABELS } from "@gira/shared";
import type { OrderDocument } from "../models/Order.js";
import type { OrderEmailSnapshot, ShippedEmailSnapshot } from "../templates/orderEmails.js";

/**
 * The flat payload every customer email is rendered from, frozen at enqueue time.
 * One builder for confirmation, preparing, shipped and delivered so the shape cannot drift.
 */
const toOrderEmailSnapshot = (order: OrderDocument): OrderEmailSnapshot => ({
  publicId: order.publicId,
  orderNumber: order.orderNumber,
  customerName: order.customer.name,
  currency: order.currency,
  subtotal: order.subtotal,
  shippingCost: order.shippingCost,
  total: order.total,
  lines: order.lines.map((line) => ({
    productName: line.productName,
    printName: line.printName,
    qty: line.qty,
    lineTotal: line.lineTotal,
  })),
});

/** Shipped/delivered emails carry the parcel. Null when the order has no usable label. */
const toShipmentEmailSnapshot = (order: OrderDocument): ShippedEmailSnapshot | null => {
  const label = order.label;
  if (!label?.trackingNumber || !label.carrier) return null;
  return {
    ...toOrderEmailSnapshot(order),
    carrierName: SHIPPING_CARRIER_LABELS[label.carrier],
    trackingNumber: label.trackingNumber,
    ...(label.trackUrl ? { trackUrl: label.trackUrl } : {}),
  };
};

export { toOrderEmailSnapshot, toShipmentEmailSnapshot };
