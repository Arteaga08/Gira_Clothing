/**
 * IVA is stored in basis points (1600 = 16 %) and typed in percent. Integer
 * math only: "10.25" becomes 1025 by joining the digits, never through a float.
 */

const PERCENT_PATTERN = /^\d{1,3}(\.\d+)?$/;
const MAX_BPS = 10_000;

type TaxParseResult = { rateBps: number } | { error: string };

const parseTaxPercent = (input: string): TaxParseResult => {
  const cleaned = input.trim().replace(",", ".");
  if (!cleaned) return { error: "Escribe la tasa de IVA." };
  if (!PERCENT_PATTERN.test(cleaned)) return { error: "Escribe un porcentaje como 16 o 8.5." };

  const [whole = "0", fraction = ""] = cleaned.split(".");
  if (fraction.length > 2) return { error: "Usa como máximo dos decimales." };

  const rateBps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (rateBps > MAX_BPS) return { error: "La tasa no puede superar el 100 %." };
  return { rateBps };
};

/** 1600 -> "16", 850 -> "8.5": the form field's starting value. */
const bpsToPercentInput = (rateBps: number): string => {
  const whole = Math.trunc(rateBps / 100);
  const fraction = String(rateBps % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
};

const formatTaxRate = (rateBps: number): string => `${bpsToPercentInput(rateBps)} %`;

export type { TaxParseResult };
export { parseTaxPercent, bpsToPercentInput, formatTaxRate };
