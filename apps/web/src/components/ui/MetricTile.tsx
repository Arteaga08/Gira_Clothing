import { cn } from "@/lib/cn";

type MetricTileLevel = "clear" | "warn" | "danger";

interface MetricTileProps {
  level?: MetricTileLevel;
  count: number | string;
  label: string;
  className?: string;
}

const LEVEL_CLASSES: Record<MetricTileLevel, string> = {
  clear: "bg-surface",
  warn: "bg-warning-soft",
  danger: "bg-danger-soft",
};

/**
 * Was duplicated exactly between AttentionBand and OutboxHealthPanel, save
 * for one difference nobody chose on purpose: one label was
 * text-text-secondary, the other inherited whatever colour was ambient.
 */
const MetricTile = ({ level = "clear", count, label, className }: MetricTileProps) => (
  <div
    data-level={level}
    className={cn("rounded-nb-sm border-2 border-ink p-3 text-left", LEVEL_CLASSES[level], className)}
  >
    <p className="font-mono text-lg font-bold leading-none">{count}</p>
    <p className="mt-2 text-2xs font-semibold leading-tight text-text-secondary">{label}</p>
  </div>
);

export type { MetricTileProps, MetricTileLevel };
export { MetricTile };
