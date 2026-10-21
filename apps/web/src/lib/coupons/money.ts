const PESOS_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * "150.50" -> 15050. Anything that would need rounding ("10.999") is rejected
 * instead of silently becoming a different amount: a coupon's value is money.
 */
const pesosToCents = (input: string): number | null => {
  const cleaned = input.trim().replace(/,/g, "");
  if (!PESOS_PATTERN.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
};

const centsToPesosInput = (cents: number): string => (cents / 100).toFixed(2);

const formatMxn = (cents: number): string =>
  `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export { pesosToCents, centsToPesosInput, formatMxn };
