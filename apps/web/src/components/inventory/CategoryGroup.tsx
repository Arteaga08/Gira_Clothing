import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { useId } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { NB_SURFACE } from "@/components/ui/styles";
import { T_DATA, T_PANEL_TITLE } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { formatInteger } from "@/lib/format";
import type { CategoryGroupData } from "@/lib/inventory/groupByCategory";
import { VariantRow } from "./VariantRow";

interface CategoryGroupProps {
  group: CategoryGroupData;
  threshold: number | null;
  open: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const variantsLabel = (total: number): string => (total === 1 ? "1 variante" : `${total} variantes`);

/**
 * A collapsible island per product category. Closed it is just a summary (how
 * many variants, how many are out or low, how many units can be sold); the
 * arrow button opens the rows. Closing never forgets which variant is selected:
 * that lives in the page.
 */
const CategoryGroup = ({ group, threshold, open, onToggle, selectedId, onSelect }: CategoryGroupProps) => {
  const bodyId = useId();

  return (
    <section className={cn(NB_SURFACE, "overflow-hidden")} aria-label={`Categoría ${group.name}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <Icon icon={CaretDownIcon} size={18} className={cn("shrink-0 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
        <span className="min-w-0 flex-1">
          <span className={cn(T_PANEL_TITLE, "block truncate")}>{group.name}</span>
          <span className="block text-2xs text-text-muted">{variantsLabel(group.total)}</span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {group.counts.out > 0 ? (
            <Badge variant="danger">{group.counts.out === 1 ? "1 agotado" : `${group.counts.out} agotados`}</Badge>
          ) : null}
          {group.counts.low > 0 ? (
            <Badge variant="warn">{group.counts.low === 1 ? "1 bajo" : `${group.counts.low} bajos`}</Badge>
          ) : null}
          <span className={T_DATA} aria-label={`${group.available} unidades disponibles`}>
            {formatInteger(group.available)}
          </span>
        </span>
      </button>
      {open ? (
        <ul id={bodyId}>
          {group.variants.map((variant) => (
            <VariantRow
              key={variant.id}
              variant={variant}
              threshold={threshold}
              selected={variant.id === selectedId}
              onSelect={() => onSelect(variant.id)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
};

export type { CategoryGroupProps };
export { CategoryGroup };
