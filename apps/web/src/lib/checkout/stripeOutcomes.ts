/** The parts of Stripe's error and result this module reads (structural, so it needs no Stripe import). */
interface StripeErrorLike {
  type?: string;
  code?: string;
  message?: string | undefined;
}

interface ConfirmResultLike {
  error?: StripeErrorLike | undefined;
  paymentIntent?: { status: string } | undefined;
}

type PaymentOutcome =
  /** Paid, or accepted and processing: the order page watches the real status. */
  | { status: "submitted" }
  /** The intent was already confirmed (a double click, a second tab). */
  | { status: "already" }
  /** The card was refused: the same order can be retried. */
  | { status: "declined"; message: string }
  /** The card data failed Stripe's own validation. */
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

const DECLINED_MESSAGE = "Tu tarjeta fue rechazada. Prueba con otra tarjeta.";
const INVALID_MESSAGE = "Revisa los datos de tu tarjeta.";
const GENERIC_MESSAGE = "No pudimos procesar el pago. Inténtalo de nuevo.";

/** Result of `stripe.confirmPayment({ redirect: "if_required" })`. Never claims "paid": that is the webhook's job. */
const mapConfirmResult = (result: ConfirmResultLike): PaymentOutcome => {
  const { error, paymentIntent } = result;
  if (error) {
    if (error.code === "payment_intent_unexpected_state") return { status: "already" };
    if (error.type === "card_error") return { status: "declined", message: error.message || DECLINED_MESSAGE };
    if (error.type === "validation_error") return { status: "invalid", message: error.message || INVALID_MESSAGE };
    return { status: "error", message: GENERIC_MESSAGE };
  }
  if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") return { status: "submitted" };
  if (paymentIntent?.status === "requires_payment_method") return { status: "declined", message: DECLINED_MESSAGE };
  return { status: "error", message: GENERIC_MESSAGE };
};

/** Error of `elements.submit()`: always the person's to fix in the form. */
const mapSubmitError = (error: StripeErrorLike): string => error.message || INVALID_MESSAGE;

export type { PaymentOutcome, StripeErrorLike, ConfirmResultLike };
export { mapConfirmResult, mapSubmitError };
