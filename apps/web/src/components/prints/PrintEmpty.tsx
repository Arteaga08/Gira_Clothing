import { MagnifyingGlassIcon, PaintBrushIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { hasActiveFilters, type PrintFilters } from "@/lib/prints/filters";
import { NewPrintButton } from "./NewPrintButton";

interface PrintEmptyProps {
  filters: PrintFilters;
  onClear: () => void;
  onCreate: () => void;
}

/** Two different empties: "nothing matches your filters" (with a way out) and "there are no prints" (with the way in). */
const PrintEmpty = ({ filters, onClear, onCreate }: PrintEmptyProps) =>
  hasActiveFilters(filters) ? (
    <EmptyState
      icon={MagnifyingGlassIcon}
      title="Ninguna estampa coincide"
      description="Prueba con otra búsqueda, otra familia o el estado «Todas»."
      action={
        <Button variant="positive" size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={PaintBrushIcon}
      title="Todavía no hay estampas"
      description="Crea la primera para poder usarla en los modelos."
      action={<NewPrintButton variant="positive" onClick={onCreate} />}
    />
  );

export type { PrintEmptyProps };
export { PrintEmpty };
