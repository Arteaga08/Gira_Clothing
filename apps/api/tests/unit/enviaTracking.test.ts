import { describe, it, expect, vi } from "vitest";
import { ShipmentTrackingStatus, ShippingCarrier } from "@gira/shared";
import {
  createEnviaShippingProvider,
  mapEnviaStatus,
} from "../../src/adapters/shipping/enviaShippingProvider.js";
import { ShippingProviderError } from "../../src/adapters/shipping/types.js";
import { signWebhook } from "../../src/utils/webhookSignature.js";

const CONFIG = {
  apiToken: "tok_test",
  environment: "sandbox" as const,
  carriers: [ShippingCarrier.ESTAFETA],
  webhookSecret: "whsec_envia",
  webhookToleranceMs: 300_000,
};
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("mapEnviaStatus", () => {
  it.each([
    ["created", ShipmentTrackingStatus.LABEL_CREATED],
    ["Picked Up", ShipmentTrackingStatus.PICKED_UP],
    ["picked_up", ShipmentTrackingStatus.PICKED_UP],
    ["shipped", ShipmentTrackingStatus.IN_TRANSIT],
    ["in transit", ShipmentTrackingStatus.IN_TRANSIT],
    ["Out for Delivery", ShipmentTrackingStatus.OUT_FOR_DELIVERY],
    ["delivered", ShipmentTrackingStatus.DELIVERED],
    ["Lost", ShipmentTrackingStatus.LOST],
    ["returned", ShipmentTrackingStatus.RETURNED],
    ["Delayed", ShipmentTrackingStatus.EXCEPTION],
    ["Address error", ShipmentTrackingStatus.EXCEPTION],
    [8, ShipmentTrackingStatus.PICKED_UP],
    [3, ShipmentTrackingStatus.DELIVERED],
    ["9", ShipmentTrackingStatus.OUT_FOR_DELIVERY],
    [22, ShipmentTrackingStatus.EXCEPTION],
  ])("%s -> %s", (raw, expected) => {
    expect(mapEnviaStatus(raw)).toBe(expected);
  });

  it.each(["canceled", "N/A", "information", "algo raro", 4, 6, 999, undefined, null])(
    "descarta %s",
    (raw) => {
      expect(mapEnviaStatus(raw)).toBeNull();
    },
  );
});

describe("enviaShippingProvider · verifyAndParseWebhook", () => {
  const provider = createEnviaShippingProvider(CONFIG);
  const make = (status: string, over: { secret?: string; ts?: string; event?: string } = {}) => {
    const event = over.event ?? "tracking.simple";
    const body = Buffer.from(
      JSON.stringify({
        type: event,
        created_at: "2026-10-19T12:00:00Z",
        data: {
          shipment_id: 1,
          tracking_number: "T123",
          carrier_name: "estafeta",
          status,
          status_description: "Paquete recolectado",
          location: "Mexico City, MX",
        },
      }),
    );
    const ts = over.ts ?? String(Date.now());
    return {
      body,
      headers: {
        "x-webhook-event": event,
        "x-webhook-id": "d1",
        "x-webhook-timestamp": ts,
        "x-webhook-signature": signWebhook({
          secret: over.secret ?? CONFIG.webhookSecret,
          event,
          body,
          timestamp: ts,
        }),
      },
    };
  };

  it("reporta que acepta webhooks solo con secreto", () => {
    expect(provider.acceptsWebhooks).toBe(true);
    expect(createEnviaShippingProvider({ ...CONFIG, webhookSecret: null }).acceptsWebhooks).toBe(
      false,
    );
  });

  it("normaliza un tracking.simple firmado", () => {
    const { body, headers } = make("picked up");
    const parsed = provider.verifyAndParseWebhook(body, headers);
    expect(parsed.deliveryId).toBe("d1");
    expect(parsed.events).toEqual([
      {
        trackingNumber: "T123",
        status: ShipmentTrackingStatus.PICKED_UP,
        rawStatus: "picked up",
        description: "Paquete recolectado",
        location: "Mexico City, MX",
        occurredAt: new Date("2026-10-19T12:00:00Z"),
      },
    ]);
  });

  it("devuelve sin eventos para un estado que no usamos o un tipo ajeno", () => {
    const a = make("canceled");
    expect(provider.verifyAndParseWebhook(a.body, a.headers).events).toEqual([]);
    const b = make("delivered", { event: "surcharge" });
    expect(provider.verifyAndParseWebhook(b.body, b.headers).events).toEqual([]);
  });

  it("lanza 400 con firma de otro secreto o timestamp viejo", () => {
    const bad = make("delivered", { secret: "otro" });
    expect(() => provider.verifyAndParseWebhook(bad.body, bad.headers)).toThrow(/firma/i);
    const old = make("delivered", { ts: String(Date.now() - 3_600_000) });
    expect(() => provider.verifyAndParseWebhook(old.body, old.headers)).toThrow(/vigente/i);
  });
});

describe("enviaShippingProvider · webhook sin fecha", () => {
  it("acepta un webhook sin created_at (cae a la hora de recepción)", () => {
    const provider = createEnviaShippingProvider(CONFIG);
    const body = Buffer.from(
      JSON.stringify({
        type: "tracking.simple",
        data: { tracking_number: "T9", status: "Delivered" },
      }),
    );
    const ts = String(Date.now());
    const parsed = provider.verifyAndParseWebhook(body, {
      "x-webhook-event": "tracking.simple",
      "x-webhook-id": "d-nodate",
      "x-webhook-timestamp": ts,
      "x-webhook-signature": signWebhook({
        secret: "whsec_envia",
        event: "tracking.simple",
        body,
        timestamp: ts,
      }),
    });
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.occurredAt).toBeInstanceOf(Date);
  });
});

describe("enviaShippingProvider · getTracking", () => {
  const entry = (trackingNumber: string, status: string, at = "2026-10-19T12:00:00Z") => ({
    trackingNumber,
    status,
    statusDescription: "ok",
    location: "CDMX",
    date: at,
  });

  it("llama a generaltrack por lotes de 50 y normaliza la respuesta", async () => {
    const numbers = Array.from({ length: 51 }, (_, i) => `T${String(i)}`);
    const fetchMock = vi.fn((_u: string, init?: RequestInit) => {
      const sent = (JSON.parse(String(init?.body)) as { trackingNumbers: string[] })
        .trackingNumbers;
      return Promise.resolve(
        json({ meta: "tracking", data: sent.map((n) => entry(n, "Delivered")) }),
      );
    });
    const out = await createEnviaShippingProvider(
      CONFIG,
      fetchMock as unknown as typeof fetch,
    ).getTracking(numbers, {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api-test.envia.com/ship/generaltrack/");
    expect(out).toHaveLength(51);
    expect(out[0]).toMatchObject({
      trackingNumber: "T0",
      status: ShipmentTrackingStatus.DELIVERED,
    });
  });

  it("ignora entradas sin estado reconocible o sin guía", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        json({ data: [entry("A", "mystery"), { status: "delivered" }, entry("B", "In Transit")] }),
      ),
    );
    const out = await createEnviaShippingProvider(
      CONFIG,
      fetchMock as unknown as typeof fetch,
    ).getTracking(["A", "B"], {});
    expect(out.map((e) => e.trackingNumber)).toEqual(["B"]);
  });

  it("descarta (no inventa fecha) una entrada de rastreo sin fecha parseable", async () => {
    const undated = { trackingNumber: "U", status: "In Transit" };
    const fetchMock = vi.fn(() =>
      Promise.resolve(json({ data: [undated, entry("D", "In Transit")] })),
    );
    const out = await createEnviaShippingProvider(
      CONFIG,
      fetchMock as unknown as typeof fetch,
    ).getTracking(["U", "D"], {});
    expect(out.map((e) => e.trackingNumber)).toEqual(["D"]);
    expect(out[0]?.occurredAt.toISOString()).toBe("2026-10-19T12:00:00.000Z");
  });

  it("meta:error con HTTP 200, 5xx y red caída -> unavailable", async () => {
    for (const make of [
      () => Promise.resolve(json({ meta: "error", error: { message: "boom" } })),
      () => Promise.resolve(json({}, 503)),
      () => Promise.reject(new Error("socket")),
    ]) {
      const provider = createEnviaShippingProvider(CONFIG, vi.fn(make) as unknown as typeof fetch);
      await expect(provider.getTracking(["T1"], {})).rejects.toMatchObject({ kind: "unavailable" });
    }
    await expect(
      createEnviaShippingProvider(
        CONFIG,
        vi.fn(() => Promise.resolve(json({}, 503))) as unknown as typeof fetch,
      ).getTracking(["T1"], {}),
    ).rejects.toBeInstanceOf(ShippingProviderError);
  });
});
