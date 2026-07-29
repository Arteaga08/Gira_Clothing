import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Currency, PaymentStatus } from "@gira/shared";
import { AppError } from "../../utils/AppError.js";
import {
  ProviderEventType,
  type CreatePaymentInput,
  type PaymentView,
  type PaymentProvider,
  type ProviderEvent,
} from "./types.js";

/**
 * No-network fallback used when Stripe credentials are absent (dev/test).
 * Deterministic ids so tests can assert on them. Its own webhook signature is
 * a plain HMAC with a fixed dev secret, so a developer (or a test) can
 * simulate a webhook without a Stripe account — the shape of the flow stays
 * identical to the real adapter.
 */

const STUB_WEBHOOK_SECRET = "stub_dev_secret";

interface StubEventPayload {
  id: string;
  type: string;
  orderId: string;
  paymentId: string;
  amount?: number;
}

const STUB_EVENT_MAP: Record<string, ProviderEventType> = {
  succeeded: ProviderEventType.PAYMENT_SUCCEEDED,
  failed: ProviderEventType.PAYMENT_FAILED,
  cancelled: ProviderEventType.PAYMENT_CANCELLED,
  refunded: ProviderEventType.PAYMENT_REFUNDED,
};

/** Deterministic id: same key -> same id, so a retried create is idempotent even in the stub. */
const deterministicId = (prefix: string, key: string): string =>
  `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;

const createStubPaymentProvider = (): PaymentProvider => {
  const createPayment = (input: CreatePaymentInput): Promise<PaymentView> => {
    const providerId = deterministicId("pi_stub", input.idempotencyKey);
    return Promise.resolve({
      providerId,
      status: PaymentStatus.REQUIRES_PAYMENT,
      amount: input.amount,
      currency: input.currency,
      clientSecret: `${providerId}_secret_stub`,
    });
  };

  const getPayment = (providerId: string): Promise<PaymentView> =>
    Promise.resolve({
      providerId,
      status: PaymentStatus.REQUIRES_PAYMENT,
      amount: 0,
      currency: Currency.MXN,
    });

  const refundPayment = (): Promise<void> => Promise.resolve();

  const parseWebhookEvent = (rawBody: Buffer, signature: string): ProviderEvent => {
    const expected = createHmac("sha256", STUB_WEBHOOK_SECRET).update(rawBody).digest("hex");
    const provided = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
      throw new AppError("Firma del webhook inválida.", 400);
    }

    let payload: StubEventPayload;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as StubEventPayload;
    } catch {
      throw new AppError("Cuerpo del webhook inválido.", 400);
    }

    return {
      id: payload.id,
      type: STUB_EVENT_MAP[payload.type] ?? ProviderEventType.IGNORED,
      paymentId: payload.paymentId,
      orderId: payload.orderId,
      ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
      raw: payload,
    };
  };

  return { createPayment, getPayment, refundPayment, parseWebhookEvent };
};

export { createStubPaymentProvider, STUB_WEBHOOK_SECRET };
