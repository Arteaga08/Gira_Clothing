import { ShipmentTrackingStatus, ShippingCarrier, ShippingProviderName } from "@gira/shared";
import type { ShippingOrigin } from "@gira/shared";
import type { EnviaConfig } from "../../config/env.js";
import {
  ShippingProviderError,
  type CallOptions,
  type CancelLabelInput,
  type CreateLabelInput,
  type LabelResult,
  type ProviderRate,
  type RatesInput,
  type ShippingDestination,
  type ShippingProvider,
  type TrackingEvent,
} from "./types.js";
import { openEnvelope } from "./webhookEnvelope.js";

/**
 * Envía (envia.com) adapter. The ONLY file that knows its endpoints, field names
 * and quirks: money crossing the boundary is MXN centavos, carriers are ours.
 *
 * Quirks handled here: errors may arrive as HTTP 200 + {meta:"error"}; auth
 * failures are plain text; the rate endpoint takes one carrier per call; and
 * there is NO idempotency key on label purchase, so an ambiguous purchase
 * (timeout / 5xx / network) is reported as `unknown_outcome` and never retried.
 */

const HOSTS = {
  sandbox: "https://api-test.envia.com",
  production: "https://api.envia.com",
} as const;

const QUOTE_TIMEOUT_MS = 8_000;
const LABEL_TIMEOUT_MS = 30_000;
const CANCEL_TIMEOUT_MS = 15_000;

const KNOWN_CARRIERS = new Set<string>(Object.values(ShippingCarrier));

type FetchLike = typeof fetch;

interface RawResponse {
  status: number;
  json: unknown;
  text: string;
}

interface EnviaError {
  failed: true;
  status: number;
  message: string;
}

interface EnviaOk {
  failed: false;
  data: unknown;
}

const toKg = (grams: number): number => Math.max(0.1, Math.round(grams / 10) / 100);
const toPesos = (centavos: number): number => Math.round(centavos) / 100;
const toCentavos = (pesos: unknown): number => Math.round(Number(pesos) * 100);

const toAddress = (a: ShippingOrigin | ShippingDestination): Record<string, unknown> => ({
  name: a.name,
  phone: a.phone,
  ...(a.email ? { email: a.email } : {}),
  street: a.line1,
  district: a.district,
  city: a.city,
  state: a.state,
  country: "MX",
  postalCode: a.postalCode,
  ...("line2" in a && a.line2 ? { reference: a.line2 } : {}),
});

const toPackage = (input: RatesInput): Record<string, unknown> => ({
  type: "box",
  content: "Ropa",
  amount: 1,
  declaredValue: toPesos(input.declaredValueMxn),
  lengthUnit: "CM",
  weightUnit: "KG",
  weight: toKg(input.parcel.weightGrams),
  dimensions: {
    length: input.parcel.lengthCm,
    width: input.parcel.widthCm,
    height: input.parcel.heightCm,
  },
});

const TRACKING_BATCH = 50;
const TRACK_TIMEOUT_MS = 15_000;

/**
 * Envía status ids (docs.envia.com, "Track Shipments": 1–28) and the lower-cased
 * names its webhook/tracking use. One table: ids and names map to the same value.
 * Unknown or non-actionable statuses (canceled, information, N/A) map to null and are dropped.
 */
const STATUS_BY_ID: Record<number, ShipmentTrackingStatus> = {
  1: ShipmentTrackingStatus.LABEL_CREATED, // Created
  2: ShipmentTrackingStatus.IN_TRANSIT, // Shipped
  3: ShipmentTrackingStatus.DELIVERED,
  7: ShipmentTrackingStatus.LABEL_CREATED, // Pending
  8: ShipmentTrackingStatus.PICKED_UP,
  9: ShipmentTrackingStatus.OUT_FOR_DELIVERY,
  10: ShipmentTrackingStatus.LOST,
  11: ShipmentTrackingStatus.RETURNED,
  12: ShipmentTrackingStatus.EXCEPTION, // Pickup at office
  13: ShipmentTrackingStatus.RETURNED, // Delivered at origin
  14: ShipmentTrackingStatus.EXCEPTION, // Damaged
  15: ShipmentTrackingStatus.IN_TRANSIT, // Redirected
  16: ShipmentTrackingStatus.LABEL_CREATED, // Out for pickup
  17: ShipmentTrackingStatus.EXCEPTION,
  18: ShipmentTrackingStatus.EXCEPTION,
  19: ShipmentTrackingStatus.EXCEPTION,
  20: ShipmentTrackingStatus.EXCEPTION, // Return problem
  21: ShipmentTrackingStatus.EXCEPTION, // Address error
  22: ShipmentTrackingStatus.EXCEPTION, // Undeliverable
  23: ShipmentTrackingStatus.EXCEPTION, // Delayed
  24: ShipmentTrackingStatus.EXCEPTION, // Rejected
  25: ShipmentTrackingStatus.LABEL_CREATED, // 1 pickup attempt
  26: ShipmentTrackingStatus.IN_TRANSIT, // Partially shipped
  27: ShipmentTrackingStatus.EXCEPTION, // Partially delivered
  28: ShipmentTrackingStatus.EXCEPTION, // Delivery attempt
};

const STATUS_BY_NAME: Record<string, ShipmentTrackingStatus> = {
  created: ShipmentTrackingStatus.LABEL_CREATED,
  pending: ShipmentTrackingStatus.LABEL_CREATED,
  "label created": ShipmentTrackingStatus.LABEL_CREATED,
  "out for pickup": ShipmentTrackingStatus.LABEL_CREATED,
  "picked up": ShipmentTrackingStatus.PICKED_UP,
  picked_up: ShipmentTrackingStatus.PICKED_UP,
  pickedup: ShipmentTrackingStatus.PICKED_UP,
  shipped: ShipmentTrackingStatus.IN_TRANSIT,
  "in transit": ShipmentTrackingStatus.IN_TRANSIT,
  in_transit: ShipmentTrackingStatus.IN_TRANSIT,
  intransit: ShipmentTrackingStatus.IN_TRANSIT,
  redirected: ShipmentTrackingStatus.IN_TRANSIT,
  "out for delivery": ShipmentTrackingStatus.OUT_FOR_DELIVERY,
  out_for_delivery: ShipmentTrackingStatus.OUT_FOR_DELIVERY,
  delivered: ShipmentTrackingStatus.DELIVERED,
  lost: ShipmentTrackingStatus.LOST,
  returned: ShipmentTrackingStatus.RETURNED,
  "delivered at origin": ShipmentTrackingStatus.RETURNED,
  damaged: ShipmentTrackingStatus.EXCEPTION,
  delayed: ShipmentTrackingStatus.EXCEPTION,
  rejected: ShipmentTrackingStatus.EXCEPTION,
  undeliverable: ShipmentTrackingStatus.EXCEPTION,
  "address error": ShipmentTrackingStatus.EXCEPTION,
  "return problem": ShipmentTrackingStatus.EXCEPTION,
  "pickup at office": ShipmentTrackingStatus.EXCEPTION,
  "delivery attempt": ShipmentTrackingStatus.EXCEPTION,
  "1 delivery attempt": ShipmentTrackingStatus.EXCEPTION,
  "2 delivery attempts": ShipmentTrackingStatus.EXCEPTION,
  "3 delivery attempts": ShipmentTrackingStatus.EXCEPTION,
  exception: ShipmentTrackingStatus.EXCEPTION,
};

/** Maps a provider status (id or text) to ours; null = not actionable. */
const mapEnviaStatus = (raw: unknown): ShipmentTrackingStatus | null => {
  if (typeof raw === "number") return STATUS_BY_ID[raw] ?? null;
  if (typeof raw !== "string") return null;
  const text = raw.trim().toLowerCase();
  if (/^\d+$/.test(text)) return STATUS_BY_ID[Number(text)] ?? null;
  return STATUS_BY_NAME[text] ?? null;
};

const parseDate = (value: unknown): Date | null => {
  const date =
    typeof value === "string" || typeof value === "number" ? new Date(value) : new Date(NaN);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * `requireDate` (polling): an undated entry is dropped, because a fallback to "now"
 * would give it a new identity on every poll. Webhook deliveries are one-off, so
 * they may fall back to the receipt time.
 */
const toTrackingEvent = (
  entry: Record<string, unknown>,
  requireDate = false,
): TrackingEvent | null => {
  const trackingNumber = entry.trackingNumber ?? entry.tracking_number;
  const rawStatus = entry.status;
  const status = mapEnviaStatus(rawStatus);
  if (typeof trackingNumber !== "string" && typeof trackingNumber !== "number") return null;
  if (!trackingNumber || !status) return null;
  const rawText =
    typeof rawStatus === "string" || typeof rawStatus === "number" ? String(rawStatus) : "";
  const description = entry.statusDescription ?? entry.status_description;
  const location = entry.location;
  const occurredAt = parseDate(entry.date ?? entry.eventDate ?? entry.updatedAt);
  if (!occurredAt && requireDate) return null;
  return {
    trackingNumber: String(trackingNumber),
    status,
    rawStatus: rawText,
    ...(typeof description === "string" && description ? { description } : {}),
    ...(typeof location === "string" && location ? { location } : {}),
    occurredAt: occurredAt ?? new Date(),
  };
};

const createEnviaShippingProvider = (
  config: EnviaConfig,
  fetchImpl: FetchLike = fetch,
): ShippingProvider => {
  const baseUrl = HOSTS[config.environment];

  /** One POST. Throws on transport trouble, returns status + parsed body otherwise. */
  const post = async (
    path: string,
    body: unknown,
    timeoutMs: number,
    options: CallOptions,
  ): Promise<RawResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    options.signal?.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined; // auth failures come back as plain text
      }
      return { status: response.status, json, text };
    } finally {
      clearTimeout(timer);
    }
  };

  /** Normalises "HTTP error" and "HTTP 200 + meta:error" into one shape. */
  const unwrap = (res: RawResponse): EnviaOk | EnviaError => {
    const json = res.json as
      | { meta?: string; error?: { message?: string; description?: string }; data?: unknown }
      | undefined;
    if (json?.meta === "error") {
      return {
        failed: true,
        status: res.status,
        message: json.error?.message ?? json.error?.description ?? "Envía rechazó la solicitud.",
      };
    }
    if (res.status >= 400) {
      return {
        failed: true,
        status: res.status,
        message: json?.error?.message ?? (res.text.slice(0, 200) || "Envía rechazó la solicitud."),
      };
    }
    return { failed: false, data: json?.data };
  };

  const getRates: ShippingProvider["getRates"] = async (input, options) => {
    const perCarrier = await Promise.allSettled(
      config.carriers.map(async (carrier) => {
        const res = await post(
          "/ship/rate/",
          {
            origin: toAddress(input.origin),
            destination: toAddress(input.destination),
            packages: [toPackage(input)],
            shipment: { carrier, type: 1 },
            settings: { currency: "MXN" },
          },
          QUOTE_TIMEOUT_MS,
          options,
        );
        const unwrapped = unwrap(res);
        if (unwrapped.failed) {
          throw new ShippingProviderError(
            unwrapped.status >= 500 || unwrapped.status === 429 ? "unavailable" : "rejected",
            unwrapped.message,
          );
        }
        return unwrapped.data;
      }),
    );

    const rates: ProviderRate[] = [];
    for (const outcome of perCarrier) {
      if (outcome.status !== "fulfilled" || !Array.isArray(outcome.value)) continue;
      for (const entry of outcome.value as Array<Record<string, unknown>>) {
        const carrier = String(entry.carrier ?? "").toLowerCase();
        if (!KNOWN_CARRIERS.has(carrier)) continue;
        const cost = toCentavos(entry.totalPrice);
        if (!Number.isFinite(cost) || cost <= 0) continue;
        const days = (entry.deliveryDate as { dateDifference?: number } | undefined)
          ?.dateDifference;
        rates.push({
          carrier: carrier as ShippingCarrier,
          service: String(entry.service),
          serviceName: String(entry.serviceDescription ?? entry.service),
          costMxn: cost,
          estimatedDays: typeof days === "number" && days >= 0 ? days : 0,
        });
      }
    }

    if (rates.length === 0) {
      const failures = perCarrier.filter(
        (o): o is PromiseRejectedResult => o.status === "rejected",
      );
      // Every carrier failed: tell WHY (bad address vs provider down). Otherwise just "no rates".
      if (failures.length === perCarrier.length && failures.length > 0) {
        const allRejected = failures.every(
          (f) => f.reason instanceof ShippingProviderError && f.reason.kind === "rejected",
        );
        if (allRejected) {
          throw new ShippingProviderError("rejected", (failures[0]!.reason as Error).message);
        }
        throw new ShippingProviderError("unavailable", "Envía no está disponible por ahora.");
      }
    }
    return rates;
  };

  const createLabel: ShippingProvider["createLabel"] = async (input: CreateLabelInput, options) => {
    let res: RawResponse;
    try {
      res = await post(
        "/ship/generate/",
        {
          origin: toAddress(input.origin),
          destination: toAddress(input.destination),
          packages: [{ ...toPackage(input), content: `Ropa ${input.orderRef}` }],
          shipment: { carrier: input.carrier, service: input.service, type: 1 },
          settings: { printFormat: "PDF", printSize: "PAPER_4X6", currency: "MXN" },
        },
        LABEL_TIMEOUT_MS,
        options,
      );
    } catch {
      // Timeout / network: the purchase may have gone through. No idempotency key exists.
      throw new ShippingProviderError(
        "unknown_outcome",
        "No se pudo confirmar si Envía generó la guía.",
      );
    }

    if (res.status >= 500) {
      throw new ShippingProviderError(
        "unknown_outcome",
        "Envía respondió con un error al generar la guía.",
      );
    }
    if (res.status === 429) {
      throw new ShippingProviderError(
        "unavailable",
        "Envía pidió esperar antes de generar la guía.",
      );
    }
    const unwrapped = unwrap(res);
    if (unwrapped.failed) {
      const message =
        res.status === 402
          ? "Saldo insuficiente en Envía para generar la guía."
          : unwrapped.message;
      throw new ShippingProviderError("rejected", message);
    }

    const entry = Array.isArray(unwrapped.data)
      ? (unwrapped.data[0] as Record<string, unknown> | undefined)
      : undefined;
    if (!entry?.trackingNumber || !entry.shipmentId || !entry.label) {
      throw new ShippingProviderError(
        "unknown_outcome",
        "Envía respondió sin los datos de la guía.",
      );
    }
    const result: LabelResult = {
      providerShipmentId: String(entry.shipmentId),
      trackingNumber: String(entry.trackingNumber),
      carrier: input.carrier,
      labelUrl: String(entry.label),
      trackUrl: String(entry.trackUrl ?? ""),
      costMxn: toCentavos(entry.totalPrice),
    };
    return result;
  };

  const cancelLabel: ShippingProvider["cancelLabel"] = async (input: CancelLabelInput, options) => {
    let res: RawResponse;
    try {
      res = await post(
        "/ship/cancel/",
        { carrier: input.carrier, trackingNumber: input.trackingNumber },
        CANCEL_TIMEOUT_MS,
        options,
      );
    } catch {
      throw new ShippingProviderError("unavailable", "Envía no respondió al cancelar la guía.");
    }
    if (res.status >= 500 || res.status === 429) {
      throw new ShippingProviderError(
        "unavailable",
        "Envía no pudo procesar la cancelación ahora.",
      );
    }
    const unwrapped = unwrap(res);
    if (unwrapped.failed) throw new ShippingProviderError("rejected", unwrapped.message);
  };

  /**
   * The response shape of /ship/generaltrack/ is NOT documented: this accepts the
   * common envelopes defensively (data[] or data.shipments[]; entries may carry
   * a history[] of events). Confirm against the sandbox (docs/SETUP-REQUERIDO.md).
   */
  const getTracking: ShippingProvider["getTracking"] = async (trackingNumbers, options) => {
    const events: TrackingEvent[] = [];
    for (let i = 0; i < trackingNumbers.length; i += TRACKING_BATCH) {
      const batch = trackingNumbers.slice(i, i + TRACKING_BATCH);
      let res: RawResponse;
      try {
        res = await post(
          "/ship/generaltrack/",
          { trackingNumbers: batch },
          TRACK_TIMEOUT_MS,
          options,
        );
      } catch {
        throw new ShippingProviderError(
          "unavailable",
          "Envía no respondió al consultar el rastreo.",
        );
      }
      const unwrapped = unwrap(res);
      if (unwrapped.failed) {
        throw new ShippingProviderError("unavailable", unwrapped.message);
      }
      const data = unwrapped.data;
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { shipments?: unknown } | undefined)?.shipments)
          ? (data as { shipments: unknown[] }).shipments
          : [];
      for (const raw of list as Array<Record<string, unknown>>) {
        const history = Array.isArray(raw.history)
          ? (raw.history as Array<Record<string, unknown>>)
          : [];
        const carrierTracking = raw.trackingNumber ?? raw.tracking_number;
        const candidates =
          history.length > 0
            ? history.map((h) => ({ trackingNumber: carrierTracking, ...h }))
            : [raw];
        for (const candidate of candidates) {
          const event = toTrackingEvent(candidate, true);
          if (event) events.push(event);
        }
      }
    }
    return events;
  };

  const verifyAndParseWebhook: ShippingProvider["verifyAndParseWebhook"] = (rawBody, headers) => {
    if (!config.webhookSecret) throw new Error("ENVIA_WEBHOOK_SECRET is not configured.");
    const { deliveryId, eventType, body } = openEnvelope(
      rawBody,
      headers,
      config.webhookSecret,
      config.webhookToleranceMs,
    );
    if (eventType !== "tracking.simple") return { deliveryId, eventType, events: [] };
    const data = (body.data ?? {}) as Record<string, unknown>;
    const event = toTrackingEvent({ ...data, date: body.created_at });
    return { deliveryId, eventType, events: event ? [event] : [] };
  };

  return {
    name: ShippingProviderName.ENVIA,
    acceptsWebhooks: config.webhookSecret !== null,
    getRates,
    createLabel,
    cancelLabel,
    getTracking,
    verifyAndParseWebhook,
  };
};

export { createEnviaShippingProvider, mapEnviaStatus };
