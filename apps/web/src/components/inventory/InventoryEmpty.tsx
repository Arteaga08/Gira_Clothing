import type { StockStatus } from "@gira/shared";
import { PackageIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import { hasActiveFilters, type InventoryFilters } from "@/lib/inventory/filters";

const EMPTY_BY_STOCK: Record<StockStatus, { title: string; description: string }> = {
  out: { title: "Nada agotado", description: "Todas las variantes activas tienen unidades disponibles." },
  low: { title: "Nada con stock bajo", description: "Ninguna variante está en o por debajo del umbral de aviso." },
  ok: { title: "Nada con stock suficiente", description: "Ninguna variante activa supera todavía el umbral de aviso." },
};

const NO_VARIANTS = {
  title: "Aún no hay variantes",
  description: "Cuando el catálogo tenga variantes (modelo × print), su stock aparece aquí.",
};

const FILTERED = {
  title: "Ninguna variante coincide",
  description: "Prueba con otra búsqueda o quita algún filtro.",
};

/**
 * Empty list copy. With filters it says they excluded everything (and the tab
 * alone gets its own sentence); with none, the catalog really has no variants.
 */
const InventoryEmpty = ({ filters }: { filters: InventoryFilters }) => {
  const onlyTab = filters.stock && !filters.category && !filters.product && !filters.print && !filters.search;
  const copy = onlyTab && filters.stock ? EMPTY_BY_STOCK[filters.stock] : hasActiveFilters(filters) ? FILTERED : NO_VARIANTS;
  return <EmptyState icon={PackageIcon} title={copy.title} description={copy.description} />;
};

export { InventoryEmpty };
