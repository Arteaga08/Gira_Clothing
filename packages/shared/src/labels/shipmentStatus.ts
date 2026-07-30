import { ShipmentStatus } from "../enums/shipment.js";

/**
 * Spanish labels for ShipmentStatus, single source shared between the API's
 * error messages (apps/api/src/utils/shipmentTransitions.ts re-exports this)
 * and the admin dashboard, so the two can never drift apart.
 */
const SHIPMENT_STATUS_LABELS: Readonly<Record<ShipmentStatus, string>> = Object.freeze({
  [ShipmentStatus.IN_TRANSIT]: "en tránsito",
  [ShipmentStatus.OUT_FOR_DELIVERY]: "en reparto",
  [ShipmentStatus.DELIVERED]: "entregado",
  [ShipmentStatus.RETURNED]: "devuelto",
  [ShipmentStatus.LOST]: "extraviado",
});

export { SHIPMENT_STATUS_LABELS };
