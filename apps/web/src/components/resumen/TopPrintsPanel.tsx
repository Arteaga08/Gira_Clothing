import type { TopPrint, Wire } from "@gira/shared";
import { PaintBrushIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { formatInteger } from "@/lib/format";

interface TopPrintsPanelProps {
  prints: readonly Wire<TopPrint>[];
  className?: string | undefined;
}

/**
 * Grouped by print across ALL products, not the top-5 slice of
 * `TopProductsPanel` — a print used on two SKUs (e.g. two sizes) sums here
 * even though it splits into two separate rows there. No SKU/product name:
 * a print has no single one.
 */
const TopPrintsPanel = ({ prints, className }: TopPrintsPanelProps) => {
  if (prints.length === 0) {
    return (
      <Panel title="Print más usado" className={className}>
        <EmptyState
          icon={PaintBrushIcon}
          title="Aún no hay prints vendidos en este periodo"
          description="Cuando se vendan productos con un print en este periodo aparecerán aquí."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Print más usado" hint="Unidades en el periodo, todos los productos" flush className={className}>
      <div>
        {prints.map((print, index) => (
          <div
            key={print.printName}
            className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-nb-sm border-[1.5px] border-ink bg-surface-sunken font-mono text-xs font-bold">
              {index + 1}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{print.printName}</p>
            <span className="shrink-0 font-mono text-sm font-bold">{formatInteger(print.units)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
};

export { TopPrintsPanel };
export type { TopPrintsPanelProps };
