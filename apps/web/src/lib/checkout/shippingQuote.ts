import type { ShippingRate } from "@gira/shared";
import { isApiError } from "@/lib/api/ApiError";
import { TOO_MANY_ATTEMPTS_MESSAGE } from "@/lib/auth/authFailures";

type QuoteFailure = { status: "no-coverage" | "error"; message: string };

const GENERIC_MESSAGE = "No pudimos cotizar el envío. Inténtalo de nuevo.";

/** The preselected option: the cheapest rate, and among equals the fastest. */
const cheapestRateId = (rates: readonly ShippingRate[]): string | null => {
  const sorted = [...rates].sort((a, b) => a.amount - b.amount || a.estimatedDays - b.estimatedDays);
  return sorted[0]?.rateId ?? null;
};

/** A 422 means the carriers do not reach that postal code (change the address); anything else is worth retrying. */
const quoteFailure = (error: unknown): QuoteFailure => {
  if (isApiError(error) && error.kind === "http" && error.status === 422) {
    return { status: "no-coverage", message: error.message };
  }
  if (isApiError(error) && error.kind === "http" && error.status === 429) {
    return { status: "error", message: TOO_MANY_ATTEMPTS_MESSAGE };
  }
  if (isApiError(error) && error.kind === "http" && error.status >= 400 && error.status < 500) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: GENERIC_MESSAGE };
};

/** Time left on a quote; an invalid date counts as already expired so a bad value never keeps a dead quote alive. */
const msUntilExpiry = (expiresAt: string, now: number): number => {
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) ? 0 : Math.max(0, at - now);
};

export type { QuoteFailure };
export { cheapestRateId, quoteFailure, msUntilExpiry };
