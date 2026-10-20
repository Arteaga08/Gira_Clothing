import { ShippingCarrier, ShipmentTrackingStatus } from "../enums/shipping.js";

const SHIPPING_CARRIER_LABELS: Record<ShippingCarrier, string> = {
  [ShippingCarrier.ESTAFETA]: "Estafeta",
  [ShippingCarrier.FEDEX]: "FedEx",
  [ShippingCarrier.DHL]: "DHL",
  [ShippingCarrier.PAQUETEXPRESS]: "Paquetexpress",
  [ShippingCarrier.REDPACK]: "Redpack",
  [ShippingCarrier.UPS]: "UPS",
};

const SHIPMENT_TRACKING_STATUS_LABELS: Record<ShipmentTrackingStatus, string> = {
  [ShipmentTrackingStatus.LABEL_CREATED]: "Guía generada",
  [ShipmentTrackingStatus.PICKED_UP]: "Recolectado",
  [ShipmentTrackingStatus.IN_TRANSIT]: "En tránsito",
  [ShipmentTrackingStatus.OUT_FOR_DELIVERY]: "En reparto",
  [ShipmentTrackingStatus.DELIVERED]: "Entregado",
  [ShipmentTrackingStatus.EXCEPTION]: "Incidencia en el envío",
  [ShipmentTrackingStatus.RETURNED]: "Devuelto",
  [ShipmentTrackingStatus.LOST]: "Extraviado",
};

export { SHIPPING_CARRIER_LABELS, SHIPMENT_TRACKING_STATUS_LABELS };
