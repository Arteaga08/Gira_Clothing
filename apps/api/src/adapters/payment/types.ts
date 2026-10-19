import type { Currency, DisputeStatus, PaymentStatus } from "@gira/shared";

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

/** What the provider knows about the charge behind a payment. All of it is optional: reading it is best-effort. */
interface ChargeDetails {
  /** When the provider took the money. */
  capturedAt?: Date;
  /** Brand + last4 ONLY (PCI SAQ-A): nothing here is enough to charge the card again. */
  card?: { brand: string; last4: string };
}

enum ProviderEventType {
  PAYMENT_SUCCEEDED = "payment_succeeded",
  PAYMENT_FAILED = "payment_failed",
  PAYMENT_CANCELLED = "payment_cancelled",
  PAYMENT_REFUNDED = "payment_refunded",
  DISPUTE_OPENED = "dispute_opened",
  /** Outcome travels in `ProviderEvent.disputeStatus`, already in OUR vocabulary. */
  DISPUTE_CLOSED = "dispute_closed",
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
  /** Cumulative amount refunded on the charge so far, minor units (charge.refunded). */
  amountRefunded?: number;
  /** Set on dispute events only. */
  disputeStatus?: DisputeStatus;
  reason?: string;
  raw: unknown;
}

interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentView>;
  getPayment(providerId: string): Promise<PaymentView>;
  /**
   * Charge-level facts (card brand/last4, capture time). Webhook payloads do not
   * carry them expanded, so they are read back from the provider on demand.
   */
  getChargeDetails(providerId: string): Promise<ChargeDetails>;
  /**
   * Closes the charging window. Called when an order expires: the hold is gone
   * and the price and the stock behind it may both have moved, so the customer
   * must not be able to confirm that intent minutes or hours later.
   */
  cancelPayment(providerId: string): Promise<void>;
  refundPayment(providerId: string, amount?: number): Promise<void>;
  /** Verifies signature + timestamp tolerance. Throws AppError(400) on failure. */
  parseWebhookEvent(rawBody: Buffer, signature: string): ProviderEvent;
}

export type { CreatePaymentInput, PaymentView, ChargeDetails, ProviderEvent, PaymentProvider };
export { ProviderEventType };
