import { PaymentStatus } from "@gira/shared";

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

export { PAYMENT_STATUS_LABELS, paymentProviderLabel };
