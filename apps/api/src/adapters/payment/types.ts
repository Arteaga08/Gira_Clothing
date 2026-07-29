import type { Currency, PaymentStatus } from "@gira/shared";

/**
 * Narrow, domain-owned payment interface. No Stripe type crosses this boundary,
 * so adding Mercado Pago later is a new file here and nothing else — the
 * services that consume it never learn which provider is live.
 */

interface CreatePaymentInput {
  /** Minor units, in `currency`. Computed by pricingService, never by the client. */
  amount: number;
  currency: Currency;
  /** Same key on a retry -> the provider returns the SAME charge, never a second one. */
  idempotencyKey: string;
  metadata: { orderId: string; publicId: string };
  receiptEmail?: string;
}

interface PaymentView {
  providerId: string;
  status: PaymentStatus;
  amount: number;
  currency: Currency;
  /** Only present right after creation — the browser needs it to mount the Element. */
  clientSecret?: string;
  lastError?: string;
}

enum ProviderEventType {
  PAYMENT_SUCCEEDED = "payment_succeeded",
  PAYMENT_FAILED = "payment_failed",
  PAYMENT_CANCELLED = "payment_cancelled",
  PAYMENT_REFUNDED = "payment_refunded",
  DISPUTE_OPENED = "dispute_opened",
  DISPUTE_CLOSED_WON = "dispute_closed_won",
  DISPUTE_CLOSED_LOST = "dispute_closed_lost",
  /** Anything we deliberately do not act on. Acknowledged with 200, never processed. */
  IGNORED = "ignored",
}

/** Provider-agnostic shape every webhook collapses into before touching business code. */
interface ProviderEvent {
  id: string;
  type: ProviderEventType;
  paymentId?: string;
  orderId?: string;
  amount?: number;
  reason?: string;
  raw: unknown;
}

interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentView>;
  getPayment(providerId: string): Promise<PaymentView>;
  refundPayment(providerId: string, amount?: number): Promise<void>;
  /** Verifies signature + timestamp tolerance. Throws AppError(400) on failure. */
  parseWebhookEvent(rawBody: Buffer, signature: string): ProviderEvent;
}

export type { CreatePaymentInput, PaymentView, ProviderEvent, PaymentProvider };
export { ProviderEventType };
