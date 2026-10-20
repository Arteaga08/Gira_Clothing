import { MAX_BULK_ORDERS } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { NB_SURFACE } from "@/components/ui/styles";

interface BulkBarProps {
  count: number;
  busy: boolean;
  onClear: () => void;
  onPrepare: () => void;
}

/** Sticky bar for the selected paid orders. The only bulk action is "pasar a en proceso". */
const BulkBar = ({ count, busy, onClear, onPrepare }: BulkBarProps) => {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Acciones en lote"
      className={`${NB_SURFACE} sticky bottom-4 z-(--z-topbar) flex flex-wrap items-center justify-between gap-3 px-4 py-3`}
    >
      <p className="text-sm font-bold">
        {count === 1 ? "1 pedido seleccionado" : `${count} pedidos seleccionados`}
        {count >= MAX_BULK_ORDERS ? <span className="font-normal text-text-secondary"> (máximo por lote)</span> : null}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClear} disabled={busy}>
          Limpiar
        </Button>
        <Button variant="primary" onClick={onPrepare} loading={busy}>
          Pasar a en proceso
        </Button>
      </div>
    </div>
  );
};

export type { BulkBarProps };
export { BulkBar };
