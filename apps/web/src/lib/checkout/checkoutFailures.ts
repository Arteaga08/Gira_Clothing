import { isApiError } from "@/lib/api/ApiError";

/** What the page offers next to the pay button when the order could not be created. */
type FailureAction =
  /** Session ended: back to the login with the return path. */
  | "login"
  /** The quote expired or no longer fits: quote again. */
  | "requote"
  /** An item is gone or has no stock: back to the cart. */
  | "cart"
  /** The coupon leaves the order under the minimum: remove it. */
  | "coupon"
  /** A pending order exists: pay or cancel it instead. */
  | "resume"
  /** Transient (network, 429, 5xx): try again. */
  | "retry"
  | "none";

interface CheckoutFailure {
  action: FailureAction;
  message: string;
  /**
   * The API refused for good (4xx other than 429). The idempotency key is then useless and is released;
   * a transient failure keeps it so the retry cannot create a second order.
   */
  definitive: boolean;
}

const RETRY_MESSAGE = "No pudimos completar la operación. Inténtalo de nuevo.";
const OFFLINE_MESSAGE = "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.";

// The API has no error codes: only its Spanish messages tell these apart.
const REQUOTE = /cotizaci[oó]n|elegir tu env[ií]o/i;
const BELOW_MINIMUM = /menos de \$10/i;
const COUPON = /cup[oó]n/i;
const ITEM_GONE = /ya no est[aá] disponible|existencias|no existe/i;
const PENDING_EXISTS = /ya tienes un pedido por pagar/i;

const mapCheckoutFailure = (error: unknown): CheckoutFailure => {
  if (!isApiError(error)) return { action: "retry", message: RETRY_MESSAGE, definitive: false };
  if (error.kind !== "http") return { action: "retry", message: OFFLINE_MESSAGE, definitive: false };

  const { status, message } = error;
  if (status === 401) {
    return { action: "login", message: "Tu sesión venció. Inicia sesión para continuar.", definitive: true };
  }
  if (status === 429 || status >= 500) return { action: "retry", message: message || RETRY_MESSAGE, definitive: false };

  if (PENDING_EXISTS.test(message)) return { action: "resume", message, definitive: true };
  if (REQUOTE.test(message)) return { action: "requote", message, definitive: true };
  if (BELOW_MINIMUM.test(message)) {
    return { action: COUPON.test(message) ? "coupon" : "cart", message, definitive: true };
  }
  if (ITEM_GONE.test(message)) return { action: "cart", message, definitive: true };
  return { action: "none", message, definitive: true };
};

export type { CheckoutFailure, FailureAction };
export { mapCheckoutFailure };
