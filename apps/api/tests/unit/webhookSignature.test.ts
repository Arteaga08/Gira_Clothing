import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signWebhook, verifyWebhookSignature } from "../../src/utils/webhookSignature.js";

const SECRET = "whsec_test";
const BODY = '{"type":"tracking.simple","data":{"tracking_number":"T1"}}';
const EVENT = "tracking.simple";
const NOW = 1_700_000_000_000;
const base = {
  secret: SECRET,
  event: EVENT,
  body: Buffer.from(BODY),
  toleranceMs: 300_000,
  now: NOW,
};

const digest = (ts: string) =>
  createHmac("sha256", SECRET).update(`${ts}.${EVENT}.${BODY}`).digest();

describe("verifyWebhookSignature", () => {
  it("acepta una firma v1 en hex", () => {
    const ts = String(NOW);
    expect(
      verifyWebhookSignature({
        ...base,
        timestamp: ts,
        signature: `v1=${digest(ts).toString("hex")}`,
      }),
    ).toBe("ok");
  });

  it("acepta la misma firma codificada en base64", () => {
    const ts = String(NOW);
    expect(
      verifyWebhookSignature({
        ...base,
        timestamp: ts,
        signature: `v1=${digest(ts).toString("base64")}`,
      }),
    ).toBe("ok");
  });

  it("rechaza una firma de otro secreto", () => {
    const ts = String(NOW);
    const bad = createHmac("sha256", "otro").update(`${ts}.${EVENT}.${BODY}`).digest("hex");
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: `v1=${bad}` })).toBe(
      "bad_signature",
    );
  });

  it("rechaza si el cuerpo cambió", () => {
    const ts = String(NOW);
    expect(
      verifyWebhookSignature({
        ...base,
        body: Buffer.from(BODY + " "),
        timestamp: ts,
        signature: `v1=${digest(ts).toString("hex")}`,
      }),
    ).toBe("bad_signature");
  });

  it("rechaza una firma sin el prefijo v1= o vacía", () => {
    const ts = String(NOW);
    expect(
      verifyWebhookSignature({ ...base, timestamp: ts, signature: digest(ts).toString("hex") }),
    ).toBe("bad_signature");
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: "v1=" })).toBe(
      "bad_signature",
    );
  });

  it("acepta cualquiera de varias firmas separadas por coma (rotación de secreto)", () => {
    const ts = String(NOW);
    const sig = `v1=deadbeef,v1=${digest(ts).toString("hex")}`;
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: sig })).toBe("ok");
  });

  it("rechaza un timestamp fuera de tolerancia (pasado o futuro) y uno no numérico", () => {
    for (const ts of [String(NOW - 300_001), String(NOW + 300_001), "abc"]) {
      expect(
        verifyWebhookSignature({
          ...base,
          timestamp: ts,
          signature: `v1=${digest(ts).toString("hex")}`,
        }),
      ).toBe("bad_timestamp");
    }
  });

  it("signWebhook produce algo que verifyWebhookSignature acepta", () => {
    const ts = String(NOW);
    const signature = signWebhook({
      secret: SECRET,
      event: EVENT,
      body: Buffer.from(BODY),
      timestamp: ts,
    });
    expect(signature.startsWith("v1=")).toBe(true);
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature })).toBe("ok");
  });
});
