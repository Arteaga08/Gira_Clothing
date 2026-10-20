import { ShippingCarrier, ShippingLabelStatus, ShipmentTrackingStatus } from "../enums/shipping.js";

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

const SHIPPING_LABEL_STATUS_LABELS: Record<ShippingLabelStatus, string> = {
  [ShippingLabelStatus.PENDING]: "Guía en cola",
  [ShippingLabelStatus.REQUESTED]: "Generando guía",
  [ShippingLabelStatus.READY]: "Guía lista",
  [ShippingLabelStatus.FAILED]: "Guía con error",
  [ShippingLabelStatus.NEEDS_REVIEW]: "Guía por revisar",
  [ShippingLabelStatus.CANCEL_PENDING]: "Cancelando guía",
  [ShippingLabelStatus.CANCELLED]: "Guía cancelada",
};

export { SHIPPING_CARRIER_LABELS, SHIPMENT_TRACKING_STATUS_LABELS, SHIPPING_LABEL_STATUS_LABELS };
