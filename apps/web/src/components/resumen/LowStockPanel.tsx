import type { LowStockItem, Wire } from "@gira/shared";
import { PackageIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";
import { formatInteger } from "@/lib/format";

interface LowStockPanelProps {
  items: readonly Wire<LowStockItem>[];
  lowStockThreshold: number;
  outOfStock: number;
  lowStock: number;
  className?: string | undefined;
}

const LowStockPanel = ({
  items,
  lowStockThreshold,
  outOfStock,
  lowStock,
  className,
}: LowStockPanelProps) => {
  if (items.length === 0) {
    return (
      <Panel title="Stock bajo" className={className}>
        <EmptyState
          icon={PackageIcon}
          title="Todo el stock está por encima del umbral"
          description={`Ningún SKU activo está en o por debajo del umbral de ${lowStockThreshold} unidades.`}
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Stock bajo"
      hint={`Umbral: ${lowStockThreshold} · ${formatInteger(outOfStock)} agotadas, ${formatInteger(lowStock)} bajas`}
      flush
      className={className}
    >
      <div>
        {items.map((item) => {
          const isOut = item.available <= 0;
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.productName}</p>
                <p className="truncate font-mono text-xs text-text-muted">{item.sku}</p>
                <p className="text-xs text-text-muted">{isOut ? "Agotada" : "Stock bajo"}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-nb-pill border-[1.5px] border-ink px-2 py-0.5 font-mono text-xs font-bold",
                  isOut ? "bg-[var(--status-disputed)]" : "bg-[var(--status-pending_payment)]",
                )}
              >
                {formatInteger(item.available)}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

export { LowStockPanel };
export type { LowStockPanelProps };
