import { AppError } from "../../utils/AppError.js";
import { verifyWebhookSignature } from "../../utils/webhookSignature.js";
import type { WebhookHeaders } from "./types.js";

interface Envelope {
  deliveryId: string;
  eventType: string;
  body: Record<string, unknown>;
}

const header = (headers: WebhookHeaders, name: string): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Header + signature + JSON checks shared by every adapter that speaks the
 * `v1=` signed-webhook scheme. Throws AppError(400); never reveals which part failed beyond a generic reason.
 */
const openEnvelope = (
  rawBody: Buffer,
  headers: WebhookHeaders,
  secret: string,
  toleranceMs: number,
): Envelope => {
  const deliveryId = header(headers, "x-webhook-id");
  const eventType = header(headers, "x-webhook-event");
  const timestamp = header(headers, "x-webhook-timestamp");
  const signature = header(headers, "x-webhook-signature");
  if (!deliveryId || !eventType || !timestamp || !signature) {
    throw new AppError("Faltan cabeceras del webhook.", 400);
  }

  const verdict = verifyWebhookSignature({
    secret,
    event: eventType,
    body: rawBody,
    timestamp,
    signature,
    toleranceMs,
  });
  if (verdict === "bad_signature") throw new AppError("Firma de webhook inválida.", 400);
  if (verdict === "bad_timestamp")
    throw new AppError("El webhook no tiene una fecha vigente.", 400);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError("Cuerpo de webhook inválido.", 400);
  }
  if (typeof parsed !== "object" || parsed === null)
    throw new AppError("Cuerpo de webhook inválido.", 400);
  return { deliveryId, eventType, body: parsed as Record<string, unknown> };
};

export type { Envelope };
export { openEnvelope };
