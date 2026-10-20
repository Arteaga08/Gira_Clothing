import { STOCK_STATUS_LABELS, stockStatusOf, type StockStatus } from "@gira/shared";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

interface StockBadgeProps {
  available: number;
  /** Settings.inventory.lowStockThreshold. Null until the counts load: only "agotado" / "OK" can be told apart. */
  threshold: number | null;
}

const VARIANT_BY_STATUS: Record<StockStatus, BadgeVariant> = { out: "danger", low: "warn", ok: "ok" };

/** Status of one variant, judged by the threshold from Settings (never a constant). */
const StockBadge = ({ available, threshold }: StockBadgeProps) => {
  const status = stockStatusOf(available, threshold ?? 0);
  return <Badge variant={VARIANT_BY_STATUS[status]}>{STOCK_STATUS_LABELS[status]}</Badge>;
};

export type { StockBadgeProps };
export { StockBadge };
