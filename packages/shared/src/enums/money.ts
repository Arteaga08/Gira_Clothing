/**
 * Every monetary amount in the system is an INTEGER in minor units (MXN
 * centavos / USD cents). Floats drift, and an order snapshot that drifts is a
 * billing bug you cannot reconstruct.
 */
enum Currency {
  MXN = "MXN",
  USD = "USD",
}

/** Applied to the DERIVED currency (USD) only. MXN is captured, never derived. */
enum PriceRounding {
  /** Nearest cent — plain conversion. */
  NONE = "none",
  /** Round up to the next 0.50 (e.g. 56.02 -> 56.50). */
  UP_TO_50_CENTS = "up_to_50_cents",
  /** Round up to the next whole unit (e.g. 56.02 -> 57.00). */
  UP_TO_UNIT = "up_to_unit",
}

export { Currency, PriceRounding };
