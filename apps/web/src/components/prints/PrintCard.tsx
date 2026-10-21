import { ImageTile } from "@/components/catalog/ImageTile";
import { Badge } from "@/components/ui/Badge";
import { NB_PRESSABLE, NB_SURFACE } from "@/components/ui/styles";
import { T_DATA } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import type { PanelPrint } from "@/lib/prints/panelPrint";

interface PrintCardProps {
  print: PanelPrint;
  onOpen: (id: string) => void;
}

const variantsLabel = (count: number): string => {
  if (count === 0) return "Sin variantes";
  return count === 1 ? "1 variante" : `${count} variantes`;
};

/**
 * One print: its picture, name, SKU (mono), family and how many active variants
 * use it. The whole card opens the side panel. A retired print is greyed and
 * flagged, never hidden: the "Estado" filter decides what is listed.
 */
const PrintCard = ({ print, onOpen }: PrintCardProps) => {
  const label = variantsLabel(print.activeVariantCount);

  return (
    <button
      type="button"
      aria-label={`${print.name}, ${print.sku}, ${label}`}
      onClick={() => onOpen(print.id)}
      className={cn(NB_SURFACE, NB_PRESSABLE, "block w-full cursor-pointer overflow-hidden text-left")}
    >
      <div className="relative">
        <ImageTile
          url={print.imageUrl}
          alt=""
          grayscale={!print.isActive}
          className="aspect-square w-full border-b-2 border-ink"
        />
        {!print.isActive ? <Badge className="absolute right-2 top-2">Retirada</Badge> : null}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <h3 className="text-sm font-bold leading-snug">{print.name}</h3>
        <div className="flex items-center justify-between gap-2">
          <span className={T_DATA}>{print.sku}</span>
          <Badge className="min-w-0 truncate">{print.family.name}</Badge>
        </div>
        <span className="text-xs text-text-secondary">{label}</span>
      </div>
    </button>
  );
};

export type { PrintCardProps };
export { PrintCard };
