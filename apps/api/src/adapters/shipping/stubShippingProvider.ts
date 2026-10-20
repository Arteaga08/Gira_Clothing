import { createHash } from "node:crypto";
import { ShippingCarrier, ShippingProviderName } from "@gira/shared";
import type { ProviderRate, ShippingProvider } from "./types.js";

/** Fixed catalogue: same input -> same output, so dev and tests are reproducible. */
const STUB_RATES: ProviderRate[] = [
  { carrier: ShippingCarrier.ESTAFETA, service: "ground", serviceName: "Terrestre", costMxn: 12_000, estimatedDays: 5 },
  { carrier: ShippingCarrier.FEDEX, service: "express", serviceName: "Express", costMxn: 15_000, estimatedDays: 3 },
  { carrier: ShippingCarrier.DHL, service: "next_day", serviceName: "Día siguiente", costMxn: 25_000, estimatedDays: 1 },
];

const createStubShippingProvider = (): ShippingProvider => ({
  name: ShippingProviderName.STUB,

  getRates: () => Promise.resolve(STUB_RATES.map((r) => ({ ...r }))),

  createLabel: (input) => {
    const digest = createHash("sha256").update(input.orderRef).digest("hex").slice(0, 12).toUpperCase();
    const rate = STUB_RATES.find((r) => r.carrier === input.carrier && r.service === input.service);
    return Promise.resolve({
      providerShipmentId: `stub-shipment-${digest}`,
      trackingNumber: `STUB${digest}`,
      carrier: input.carrier,
      labelUrl: `https://stub.invalid/labels/${digest}.pdf`,
      trackUrl: `https://stub.invalid/track/STUB${digest}`,
      costMxn: rate?.costMxn ?? 0,
    });
  },

  cancelLabel: () => Promise.resolve(),
});

export { createStubShippingProvider };
