import { SHIPPING_CARRIER_LABELS, type ShippingCarrier } from "@gira/shared";

/** "DHL Terrestre", without repeating the carrier when the service name already starts with it ("FedEx Económico"). */
const carrierServiceLabel = (carrier: ShippingCarrier, serviceName: string | undefined): string => {
  const carrierName = SHIPPING_CARRIER_LABELS[carrier];
  const service = serviceName?.trim();
  if (!service) return carrierName;
  return service.toLowerCase().startsWith(carrierName.toLowerCase()) ? service : `${carrierName} ${service}`;
};

export { carrierServiceLabel };
