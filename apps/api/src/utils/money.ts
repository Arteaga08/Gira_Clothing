import { Currency, PriceRounding } from "@gira/shared";
import { AppError } from "./AppError.js";

/**
 * Money is ALWAYS an integer in minor units (MXN centavos / USD cents). No
 * float ever touches a price: an order snapshot that drifts by a centavo is a
 * billing bug you cannot reconstruct after the fact.
 *
 * MXN is the captured currency; USD is derived from a configurable rate stored
 * in Settings as `mxnPerUsdCents` (e.g. 1785 == 17.85 MXN per 1 USD), so the
 * rate itself is an integer too. Rounding applies ONLY to the derived currency.
 *
 * Both the rate and the rounding mode are frozen into the order snapshot: a
 * rate change tomorrow must never alter what a customer was charged today.
 */

const MINOR_UNITS = 100;
const HALF_UNIT = 50;

const ceilToStep = (amount: number, step: number): number => Math.ceil(amount / step) * step;

const applyRounding = (amount: number, rounding: PriceRounding): number => {
  switch (rounding) {
    case PriceRounding.UP_TO_50_CENTS:
      return ceilToStep(amount, HALF_UNIT);
    case PriceRounding.UP_TO_UNIT:
      return ceilToStep(amount, MINOR_UNITS);
    default:
      return amount;
  }
};

const convertFromMxn = (
  mxnCents: number,
  currency: Currency,
  mxnPerUsdCents: number,
  rounding: PriceRounding,
): number => {
  if (currency === Currency.MXN) return mxnCents;

  if (!Number.isInteger(mxnPerUsdCents) || mxnPerUsdCents <= 0) {
    // Configuration error, not user input — Settings validation should have caught it.
    throw new AppError("El tipo de cambio configurado no es válido.", 500);
  }

  const cents = Math.round((mxnCents * MINOR_UNITS) / mxnPerUsdCents);
  return applyRounding(cents, rounding);
};

export { applyRounding, convertFromMxn };
