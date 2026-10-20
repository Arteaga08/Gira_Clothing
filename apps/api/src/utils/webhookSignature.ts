import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * `X-Webhook-Signature: v1=HMAC-SHA256(ts + "." + event + "." + body, secret)`.
 * The provider's docs do not say whether the digest is hex or base64, so both
 * encodings of the SAME digest are accepted: the secret is what authenticates,
 * not the encoding. Revisit when support confirms (docs/SETUP-REQUERIDO.md).
 */

type SignatureVerdict = "ok" | "bad_signature" | "bad_timestamp";

interface SignInput {
  secret: string;
  event: string;
  body: Buffer;
  /** Unix milliseconds, as sent in X-Webhook-Timestamp. */
  timestamp: string;
}

interface VerifyInput extends SignInput {
  signature: string;
  toleranceMs: number;
  now?: number;
}

const digestOf = ({ secret, event, body, timestamp }: SignInput): Buffer =>
  createHmac("sha256", secret).update(`${timestamp}.${event}.`).update(body).digest();

const signWebhook = (input: SignInput): string => `v1=${digestOf(input).toString("hex")}`;

const safeEqual = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b);

const verifyWebhookSignature = (input: VerifyInput): SignatureVerdict => {
  const sentAt = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > input.toleranceMs)
    return "bad_timestamp";

  const expected = digestOf(input);
  const candidates = input.signature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter((value) => value.length > 0);

  for (const candidate of candidates) {
    const asHex = /^[0-9a-fA-F]+$/.test(candidate) ? Buffer.from(candidate, "hex") : null;
    const asBase64 = Buffer.from(candidate, "base64");
    if ((asHex && safeEqual(asHex, expected)) || safeEqual(asBase64, expected)) return "ok";
  }
  return "bad_signature";
};

export type { SignatureVerdict, SignInput, VerifyInput };
export { signWebhook, verifyWebhookSignature };
