import type { TopProduct, Wire } from "@gira/shared";
import { TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { formatInteger } from "@/lib/format";

interface TopProductsPanelProps {
  products: readonly Wire<TopProduct>[];
  className?: string | undefined;
}

const TopProductsPanel = ({ products, className }: TopProductsPanelProps) => {
  if (products.length === 0) {
    return (
      <Panel title="Más vendidos" className={className}>
        <EmptyState
          icon={TrophyIcon}
          title="Aún no hay ventas en este periodo"
          description="Cuando se vendan productos en este periodo aparecerán aquí."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Más vendidos" hint="Unidades en el periodo" flush className={className}>
      <div>
        {products.map((product, index) => (
          <div
            key={product.sku}
            className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-nb-sm border-[1.5px] border-ink bg-surface-sunken font-mono text-xs font-bold">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {product.productName} · {product.printName}
              </p>
              <p className="font-mono text-xs text-text-muted">{product.sku}</p>
            </div>
            <span className="shrink-0 font-mono text-sm font-bold">{formatInteger(product.units)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
};

export { TopProductsPanel };
export type { TopProductsPanelProps };
