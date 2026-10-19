/**
 * Catalog prices INCLUDE tax (B2C MX), so `tax` is a breakdown OF the total,
 * not an addition to it: net = round(total·10000/(10000+bps)); tax = total − net.
 * Deriving tax by subtraction guarantees net + tax === total to the unit.
 * The discount must already be subtracted from `total` — otherwise we would
 * report tax on money the customer never paid.
 */
const MAX_BPS = 10_000;

const splitTax = (total: number, rateBps: number): { net: number; tax: number } => {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > MAX_BPS) {
    throw new RangeError("La tasa de IVA debe ser un entero entre 0 y 10000 puntos base.");
  }
  const net = Math.round((total * MAX_BPS) / (MAX_BPS + rateBps));
  return { net, tax: total - net };
};

export { splitTax };
