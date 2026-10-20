import { createHash } from "node:crypto";
import { ShipmentTrackingStatus, ShippingCarrier, ShippingProviderName } from "@gira/shared";
import type { ProviderRate, ShippingProvider, TrackingEvent } from "./types.js";
import { openEnvelope } from "./webhookEnvelope.js";

/** Fixed catalogue: same input -> same output, so dev and tests are reproducible. */
const STUB_RATES: ProviderRate[] = [
  {
    carrier: ShippingCarrier.ESTAFETA,
    service: "ground",
    serviceName: "Terrestre",
    costMxn: 12_000,
    estimatedDays: 5,
  },
  {
    carrier: ShippingCarrier.FEDEX,
    service: "express",
    serviceName: "Express",
    costMxn: 15_000,
    estimatedDays: 3,
  },
  {
    carrier: ShippingCarrier.DHL,
    service: "next_day",
    serviceName: "Día siguiente",
    costMxn: 25_000,
    estimatedDays: 1,
  },
];

const STUB_TOLERANCE_MS = 300_000;
const STATUS_VALUES = new Set<string>(Object.values(ShipmentTrackingStatus));

interface StubOptions {
  /** null/absent = the stub rejects webhooks like an unconfigured production would. */
  webhookSecret?: string | null;
}

const createStubShippingProvider = (options: StubOptions = {}): ShippingProvider => {
  const secret = options.webhookSecret ?? null;
  return {
    name: ShippingProviderName.STUB,
    acceptsWebhooks: secret !== null,

    getRates: () => Promise.resolve(STUB_RATES.map((r) => ({ ...r }))),

    createLabel: (input) => {
      const digest = createHash("sha256")
        .update(input.orderRef)
        .digest("hex")
        .slice(0, 12)
        .toUpperCase();
      const rate = STUB_RATES.find(
        (r) => r.carrier === input.carrier && r.service === input.service,
      );
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

    getTracking: (trackingNumbers) =>
      Promise.resolve(
        trackingNumbers.map((trackingNumber): TrackingEvent => ({
          trackingNumber,
          status: ShipmentTrackingStatus.LABEL_CREATED,
          rawStatus: "created",
          occurredAt: new Date(0),
        })),
      ),

    verifyAndParseWebhook: (rawBody, headers) => {
      if (secret === null) throw new Error("Stub webhook secret is not configured.");
      const { deliveryId, eventType, body } = openEnvelope(
        rawBody,
        headers,
        secret,
        STUB_TOLERANCE_MS,
      );
      if (eventType !== "tracking.simple") return { deliveryId, eventType, events: [] };
      const data = (body.data ?? {}) as Record<string, unknown>;
      const rawStatus = typeof data.status === "string" ? data.status : "";
      const trackingNumber = typeof data.tracking_number === "string" ? data.tracking_number : "";
      if (!trackingNumber || !STATUS_VALUES.has(rawStatus))
        return { deliveryId, eventType, events: [] };
      const createdAt =
        typeof body.created_at === "string" ? new Date(body.created_at) : new Date();
      return {
        deliveryId,
        eventType,
        events: [
          {
            trackingNumber,
            status: rawStatus as ShipmentTrackingStatus,
            rawStatus,
            ...(typeof data.status_description === "string"
              ? { description: data.status_description }
              : {}),
            ...(typeof data.location === "string" ? { location: data.location } : {}),
            occurredAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
          },
        ],
      };
    },
  };
};

export type { StubOptions };
export { createStubShippingProvider };
