import { AuditAction } from "../enums/auditAction.js";

type StockStatus = "out" | "low" | "ok";

/** Spanish labels for StockStatus. Exhaustive Record: a new status breaks the typecheck. */
const STOCK_STATUS_LABELS: Readonly<Record<StockStatus, string>> = Object.freeze({
  out: "Agotado",
  low: "Stock bajo",
  ok: "OK",
});

/** Spanish labels for the two audit actions that move stock. */
const STOCK_ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  [AuditAction.STOCK_SET]: "Recuento",
  [AuditAction.STOCK_ADJUSTED]: "Movimiento",
});

/**
 * Out at or under zero, low at or under the threshold, ok otherwise. The
 * threshold is Settings.inventory.lowStockThreshold — callers pass it in, it is
 * never a constant here. With a threshold of 0 nothing can be "low": every
 * non-positive figure is already "out".
 */
const stockStatusOf = (available: number, threshold: number): StockStatus => {
  if (available <= 0) return "out";
  if (available <= threshold) return "low";
  return "ok";
};

export type { StockStatus };
export { STOCK_STATUS_LABELS, STOCK_ACTION_LABELS, stockStatusOf };
