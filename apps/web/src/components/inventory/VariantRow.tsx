import { cn } from "@/lib/cn";
import { T_DATA } from "@/components/ui/typography";
import { formatInteger } from "@/lib/format";
import type { PanelVariant } from "@/lib/inventory/panelVariant";
import { PrintThumb } from "./PrintThumb";
import { StockBadge } from "./StockBadge";

interface VariantRowProps {
  variant: PanelVariant;
  threshold: number | null;
  /** The variant shown in the preview pane. */
  selected: boolean;
  onSelect: () => void;
}

/** One variant (model × print) inside an open category. The whole row is the button; the status never relies on colour alone. */
const VariantRow = ({ variant, threshold, selected, onSelect }: VariantRowProps) => (
  <li>
    <button
      type="button"
      onClick={onSelect}
      {...(selected ? { "aria-current": "true" as const } : {})}
      className={cn(
        "flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left",
        "hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        selected && "bg-brand-subtle",
      )}
    >
      <PrintThumb url={variant.print.image.url} alt="" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{variant.product.name}</span>
        <span className="block truncate text-xs text-text-secondary">{variant.print.name}</span>
        <span className="block font-mono text-2xs text-text-muted">{variant.sku}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={T_DATA} aria-label={`${variant.available} disponibles`}>
          {formatInteger(variant.available)}
        </span>
        <StockBadge available={variant.available} threshold={threshold} />
      </span>
    </button>
  </li>
);

export type { VariantRowProps };
export { VariantRow };
