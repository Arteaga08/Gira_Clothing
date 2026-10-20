import type { InventoryStats, Wire } from "@gira/shared";

/** What the tabs and the status badges need from the stats endpoint; the sample list and unit totals stay behind. */
interface InventoryCounts {
  /** Settings.inventory.lowStockThreshold, as the API reports it. */
  threshold: number;
  /** Active variants: the "Todos" tab. */
  total: number;
  out: number;
  low: number;
  ok: number;
}

const toInventoryCounts = (stats: Wire<InventoryStats>): InventoryCounts => ({
  threshold: stats.lowStockThreshold,
  total: stats.activeVariants,
  out: stats.outOfStock,
  low: stats.lowStock,
  ok: Math.max(0, stats.activeVariants - stats.outOfStock - stats.lowStock),
});

export { toInventoryCounts };
export type { InventoryCounts };
