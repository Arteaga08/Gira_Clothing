import { describe, it, expect } from "vitest";
import { ShipmentTrackingStatus } from "@gira/shared";
import { createStubShippingProvider } from "../../src/adapters/shipping/stubShippingProvider.js";
import { signWebhook } from "../../src/utils/webhookSignature.js";

const SECRET = "stub_secret";
const body = (status: string, tracking = "STUB1") =>
  Buffer.from(
    JSON.stringify({
      type: "tracking.simple",
      created_at: "2026-10-19T10:00:00Z",
      data: { tracking_number: tracking, status, status_description: "Desc", location: "CDMX" },
    }),
  );
const headers = (b: Buffer, ts = String(Date.now()), id = "evt_1", secret = SECRET) => ({
  "x-webhook-event": "tracking.simple",
  "x-webhook-id": id,
  "x-webhook-timestamp": ts,
  "x-webhook-signature": signWebhook({ secret, event: "tracking.simple", body: b, timestamp: ts }),
});

describe("stub · webhook", () => {
  it("no acepta webhooks sin secreto", () => {
    expect(createStubShippingProvider().acceptsWebhooks).toBe(false);
  });

  it("verifica la firma y entrega el evento normalizado", () => {
    const stub = createStubShippingProvider({ webhookSecret: SECRET });
    const b = body("delivered");
    const parsed = stub.verifyAndParseWebhook(b, headers(b));
    expect(parsed.deliveryId).toBe("evt_1");
    expect(parsed.eventType).toBe("tracking.simple");
    expect(parsed.events).toEqual([
      expect.objectContaining({
        trackingNumber: "STUB1",
        status: ShipmentTrackingStatus.DELIVERED,
        rawStatus: "delivered",
      }),
    ]);
  });

  it("lanza 400 con firma inválida, sin cabeceras o timestamp viejo", () => {
    const stub = createStubShippingProvider({ webhookSecret: SECRET });
    const b = body("delivered");
    expect(() => stub.verifyAndParseWebhook(b, headers(b, undefined, "e", "otro"))).toThrow(
      /firma/i,
    );
    expect(() => stub.verifyAndParseWebhook(b, {})).toThrow(/cabeceras/i);
    expect(() =>
      stub.verifyAndParseWebhook(b, headers(b, String(Date.now() - 10 * 60_000))),
    ).toThrow(/vigente|fecha/i);
  });

  it("getTracking responde un evento determinista por guía", async () => {
    const stub = createStubShippingProvider();
    const out = await stub.getTracking(["STUB1", "STUB2"], {});
    expect(out.map((e) => e.trackingNumber)).toEqual(["STUB1", "STUB2"]);
    expect(out.every((e) => e.status === ShipmentTrackingStatus.LABEL_CREATED)).toBe(true);
  });
});
