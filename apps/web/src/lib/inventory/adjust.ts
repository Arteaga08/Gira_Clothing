import { STOCK_DELTA_MAX, STOCK_ON_HAND_MAX, STOCK_REASON_MAX } from "@gira/shared";

type AdjustMode = "count" | "move";

type StockAdjustmentBody = { onHand: number; reason?: string } | { delta: number; reason?: string };

type AdjustmentResult = { ok: true; body: StockAdjustmentBody } | { ok: false; error: string };

const COUNT_PATTERN = /^\d+$/;
const MOVE_PATTERN = /^[+-]?\d+$/;

const fail = (error: string): AdjustmentResult => ({ ok: false, error });

/**
 * Pre-checks the form against the same bounds the API enforces, so the common
 * mistakes read well before a round trip. The API stays the authority (a 409
 * from a concurrent order is still possible and is shown as-is).
 */
const validateAdjustment = (
  mode: AdjustMode,
  rawValue: string,
  rawReason: string,
  stock: { onHand: number; reserved: number },
): AdjustmentResult => {
  const value = rawValue.trim();
  const reason = rawReason.trim();
  if (reason.length > STOCK_REASON_MAX) return fail(`El motivo no puede pasar de ${STOCK_REASON_MAX} caracteres.`);
  const withReason = <T extends object>(body: T): { ok: true; body: StockAdjustmentBody } => ({
    ok: true,
    body: (reason ? { ...body, reason } : body) as StockAdjustmentBody,
  });

  if (mode === "count") {
    if (!COUNT_PATTERN.test(value)) return fail("Escribe cuántas unidades hay en total, con números enteros.");
    const onHand = Number(value);
    if (onHand > STOCK_ON_HAND_MAX) return fail(`El máximo es ${STOCK_ON_HAND_MAX.toLocaleString("es-MX")} unidades.`);
    if (onHand < stock.reserved) {
      return fail(`No puede ser menos de lo apartado (${stock.reserved}): hay pedidos esperando esas unidades.`);
    }
    return withReason({ onHand });
  }

  if (!MOVE_PATTERN.test(value)) return fail("Escribe el movimiento con un entero, por ejemplo +24 o -2.");
  const delta = Number(value);
  if (delta === 0) return fail("El movimiento no puede ser 0.");
  if (Math.abs(delta) > STOCK_DELTA_MAX) {
    return fail(`El movimiento máximo es ${STOCK_DELTA_MAX.toLocaleString("es-MX")} unidades.`);
  }
  if (stock.onHand + delta < stock.reserved) {
    return fail(`El disponible no puede quedar en negativo: hay ${stock.reserved} unidades apartadas.`);
  }
  return withReason({ delta });
};

export { validateAdjustment };
export type { AdjustMode, StockAdjustmentBody, AdjustmentResult };
