import { MagnifyingGlassIcon, TShirtIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { hasActiveFilters, type CatalogFilters } from "@/lib/catalog/filters";
import { NewProductButton } from "./NewProductButton";

interface ProductEmptyProps {
  filters: CatalogFilters;
  onClear: () => void;
}

/** Two different empties: "nothing matches your filters" (with a way out) and "the catalog is empty" (with the way in). */
const ProductEmpty = ({ filters, onClear }: ProductEmptyProps) =>
  hasActiveFilters(filters) ? (
    <EmptyState
      icon={MagnifyingGlassIcon}
      title="Ningún modelo coincide"
      description="Prueba con otra búsqueda, otra categoría o el estado «Todos»."
      action={
        <Button variant="positive" size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={TShirtIcon}
      title="Todavía no hay modelos"
      description="Crea el primero para empezar a armar el catálogo."
      action={<NewProductButton variant="positive" />}
    />
  );

export type { ProductEmptyProps };
export { ProductEmpty };
