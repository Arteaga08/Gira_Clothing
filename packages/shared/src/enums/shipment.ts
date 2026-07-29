/**
 * Shipment lifecycle, independent of OrderStatus on purpose: an order is
 * "shipped" the moment the package leaves, but the parcel itself keeps moving
 * through states the order does not care about. Valid transitions live in
 * apps/api/src/utils/shipmentTransitions.ts.
 */
enum ShipmentStatus {
  IN_TRANSIT = "in_transit",
  OUT_FOR_DELIVERY = "out_for_delivery",
  DELIVERED = "delivered",
  RETURNED = "returned",
  LOST = "lost",
}

export { ShipmentStatus };
