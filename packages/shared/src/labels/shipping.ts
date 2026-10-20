import { ShippingCarrier } from "../enums/shipping.js";

const SHIPPING_CARRIER_LABELS: Record<ShippingCarrier, string> = {
  [ShippingCarrier.ESTAFETA]: "Estafeta",
  [ShippingCarrier.FEDEX]: "FedEx",
  [ShippingCarrier.DHL]: "DHL",
  [ShippingCarrier.PAQUETEXPRESS]: "Paquetexpress",
  [ShippingCarrier.REDPACK]: "Redpack",
  [ShippingCarrier.UPS]: "UPS",
};

export { SHIPPING_CARRIER_LABELS };
