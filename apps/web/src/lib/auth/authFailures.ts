import { isApiError } from "@/lib/api/ApiError";

const TOO_MANY_ATTEMPTS_MESSAGE = "Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
const SERVER_FAILURE_MESSAGE = "Algo salió mal de nuestro lado. Inténtalo de nuevo en un momento.";
const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado.";

interface FailureOptions {
  /** What a 401 means on this screen (wrong credentials, wrong password on the verify link…). */
  unauthorized?: string;
}

/**
 * The text to show for a failed account call. The API answers `{status, message}`
 * with no typed code, so this maps by HTTP status; 429 and 5xx never echo the
 * server's text, the rest keeps the API's own Spanish message.
 */
const authFailureMessage = (error: unknown, options: FailureOptions = {}): string => {
  if (!isApiError(error)) return UNEXPECTED_MESSAGE;
  if (error.kind !== "http") return error.message;
  if (error.status === 429) return TOO_MANY_ATTEMPTS_MESSAGE;
  if (error.status >= 500) return SERVER_FAILURE_MESSAGE;
  if (error.status === 401 && options.unauthorized) return options.unauthorized;
  return error.message;
};

/** Login answers 403 only after the password was right: the account exists but the email is not verified. */
const isUnverifiedFailure = (error: unknown): boolean =>
  isApiError(error) && error.kind === "http" && error.status === 403;

export type { FailureOptions };
export { authFailureMessage, isUnverifiedFailure, TOO_MANY_ATTEMPTS_MESSAGE, SERVER_FAILURE_MESSAGE };
