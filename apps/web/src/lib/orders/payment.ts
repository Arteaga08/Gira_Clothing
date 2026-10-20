import { PaymentStatus, REFUND_REQUEST_STALE_MS } from "@gira/shared";

/** Exhaustive: a new payment status without a Spanish label fails the typecheck. */
const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.REQUIRES_PAYMENT]: "Pendiente de pago",
  [PaymentStatus.PROCESSING]: "Procesando",
  [PaymentStatus.SUCCEEDED]: "Pagado",
  [PaymentStatus.FAILED]: "Fallido",
  [PaymentStatus.CANCELLED]: "Cancelado",
  [PaymentStatus.REFUNDED]: "Reembolsado",
};

const PROVIDER_LABELS: Readonly<Record<string, string>> = { stripe: "Stripe" };

/** Known providers get their brand spelling; an unknown one is shown as the API sent it. */
const paymentProviderLabel = (provider: string): string => PROVIDER_LABELS[provider] ?? provider;

/**
 * A refund was asked of the provider and its webhook has not confirmed it. Mirrors the API guard, which
 * accepts a new request once the old one is stale, so the button comes back exactly when the API allows it.
 */
const isRefundPending = (payment: { refundRequestedAt?: string }, now: number = Date.now()): boolean => {
  if (!payment.refundRequestedAt) return false;
  const requestedAt = Date.parse(payment.refundRequestedAt);
  return Number.isFinite(requestedAt) && now - requestedAt < REFUND_REQUEST_STALE_MS;
};

export { PAYMENT_STATUS_LABELS, isRefundPending, paymentProviderLabel };
