import type { LowStockItem, Wire } from "@gira/shared";
import { PackageIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListRow } from "@/components/ui/ListRow";
import { Panel } from "@/components/ui/Panel";
import { formatInteger } from "@/lib/format";

interface LowStockPanelProps {
  items: readonly Wire<LowStockItem>[];
  lowStockThreshold: number;
  outOfStock: number;
  lowStock: number;
  className?: string | undefined;
}

const LINK_CLASSES = "text-xs font-bold underline underline-offset-2 hover:text-brand";

/** Shortcuts into the inventory panel, already filtered by state. */
const InventoryLinks = () => (
  <>
    <Link href="/inventario?estado=agotado" className={LINK_CLASSES}>
      Ver agotadas
    </Link>
    <Link href="/inventario?estado=bajo" className={LINK_CLASSES}>
      Ver stock bajo
    </Link>
  </>
);

const LowStockPanel = ({
  items,
  lowStockThreshold,
  outOfStock,
  lowStock,
  className,
}: LowStockPanelProps) => {
  if (items.length === 0) {
    return (
      <Panel title="Stock bajo" actions={<InventoryLinks />} className={className}>
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
      actions={<InventoryLinks />}
      flush
      className={className}
    >
      <div>
        {items.map((item) => {
          const isOut = item.available <= 0;
          return (
            <ListRow
              key={item.id}
              title={item.productName}
              sub={`${item.sku} · ${isOut ? "Agotada" : "Stock bajo"}`}
              right={
                <Badge variant={isOut ? "danger" : "warn"}>{formatInteger(item.available)}</Badge>
              }
            />
          );
        })}
      </div>
    </Panel>
  );
};

export { LowStockPanel };
export type { LowStockPanelProps };
