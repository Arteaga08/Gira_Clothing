import { Currency } from "@gira/shared";
import { formatMoneyParts } from "@/lib/format";

/** Up to 9 whole digits and at most 2 decimals: the API's 10,000,000-centavo ceiling is 100,000.00 pesos. */
const PESOS_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

/**
 * The form captures pesos as text ("189", "189.5", "$1,234.50"); the API wants
 * integer centavos. The conversion is string-based so 0.1 + 0.2 float drift can
 * never reach a price. `null` means "not a valid amount".
 */
const parsePesos = (text: string): number | null => {
  const clean = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!PESOS_PATTERN.test(clean)) return null;
  const [whole = "0", fraction = ""] = clean.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};

/** Centavos back to the text an input shows: always two decimals, no grouping. */
const centsToPesosText = (cents: number): string => (cents / 100).toFixed(2);

/** "$1,234.50" for display (money is mono at the call site). */
const formatPesos = (cents: number): string => {
  const { amount, fraction } = formatMoneyParts(cents, Currency.MXN);
  return `${amount}${fraction}`;
};

export { parsePesos, centsToPesosText, formatPesos };
