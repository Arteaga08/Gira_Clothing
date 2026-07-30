import type { ShipmentStatus } from "../enums/shipment.js";

interface ShipmentEvent {
  status: ShipmentStatus;
  at: Date;
  note?: string;
}

interface PublicTracking {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  status: ShipmentStatus;
  events: ShipmentEvent[];
}

interface AdminShipment extends PublicTracking {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Row shape for GET /admin/shipments — distinct from AdminShipment on purpose:
 * a list row needs `id`/`order` to link somewhere; the order-nested endpoint
 * never did, and `events[]` is unbounded so the list drops it for `lastEventAt`.
 */
interface AdminShipmentListItem {
  id: string;
  order: string;
  orderPublicId: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  status: ShipmentStatus;
  lastEventAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type { ShipmentEvent, PublicTracking, AdminShipment, AdminShipmentListItem };
