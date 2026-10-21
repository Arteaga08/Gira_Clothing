import { MagnifyingGlassIcon, TagIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { TaxonConfig } from "@/lib/taxonomy/config";
import { hasActiveFilters, type TaxonFilters } from "@/lib/taxonomy/filters";
import { NewTaxonButton } from "./NewTaxonButton";

interface TaxonEmptyProps {
  config: TaxonConfig;
  filters: TaxonFilters;
  onClear: () => void;
  onCreate: () => void;
}

/** Two different empties: "nothing matches your filters" (with a way out) and "there are none" (with the way in). */
const TaxonEmpty = ({ config, filters, onClear, onCreate }: TaxonEmptyProps) =>
  hasActiveFilters(filters) ? (
    <EmptyState
      icon={MagnifyingGlassIcon}
      title={`Ninguna ${config.singular} coincide`}
      description="Prueba con otra búsqueda o con el estado «Todas»."
      action={
        <Button size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={TagIcon}
      title={`Todavía no hay ${config.title.toLowerCase()}`}
      description={`Crea la primera para organizar tus ${config.child.plural}.`}
      action={<NewTaxonButton label={config.newLabel} variant="secondary" onClick={onCreate} />}
    />
  );

export type { TaxonEmptyProps };
export { TaxonEmpty };
