import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ListRowProps {
  /** Rank number (Más vendidos, Top estampas) — omitted for a plain row (Stock bajo). */
  rank?: number;
  title: string;
  sub?: string;
  /** Trailing content: a mono value, a Badge, whatever the row needs on the right. */
  right?: ReactNode;
  className?: string;
}

/**
 * The row that used to be copy-pasted, char for char, across
 * TopProductsPanel, TopPrintsPanel and LowStockPanel — and had already
 * drifted once (Skeleton's placeholder row used a different gap).
 */
const ListRow = ({ rank, title, sub, right, className }: ListRowProps) => (
  <div className={cn("flex items-center gap-3 border-t border-border px-6 py-3.5 first:border-t-0", className)}>
    {rank !== undefined ? (
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-nb-sm border-[1.5px] border-ink bg-surface-sunken font-mono text-xs font-bold">
        {rank}
      </span>
    ) : null}
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold">{title}</p>
      {sub ? <p className="truncate font-mono text-2xs text-text-muted">{sub}</p> : null}
    </div>
    {right !== undefined ? <div className="shrink-0">{right}</div> : null}
  </div>
);

export type { ListRowProps };
export { ListRow };
