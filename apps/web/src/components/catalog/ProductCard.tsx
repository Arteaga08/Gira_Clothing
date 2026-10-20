import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { NB_PRESSABLE, NB_SURFACE } from "@/components/ui/styles";
import { T_DATA } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { formatPesos } from "@/lib/catalog/money";
import type { PanelProduct } from "@/lib/catalog/panelProduct";
import { productPath } from "@/lib/catalog/productId";
import { ImageTile } from "./ImageTile";

interface ProductCardProps {
  product: PanelProduct;
}

const printsLabel = (count: number): string => {
  if (count === 0) return "Sin estampas";
  return count === 1 ? "1 estampa" : `${count} estampas`;
};

/**
 * One model: its cover, name, base price (mono) and up to five print
 * thumbnails. The whole card is the link to the editor. A retired model is
 * greyed and flagged, never hidden: the "Estado" filter decides what is listed.
 */
const ProductCard = ({ product }: ProductCardProps) => {
  const hidden = product.activeVariantCount - product.prints.length;

  return (
    <Link href={productPath(product.id)} className={cn(NB_SURFACE, NB_PRESSABLE, "block overflow-hidden")}>
      <div className="relative">
        <ImageTile
          url={product.cover?.url}
          alt=""
          grayscale={!product.isActive}
          className="aspect-square w-full border-b-2 border-ink"
        />
        {!product.isActive ? <Badge className="absolute right-2 top-2">Retirado</Badge> : null}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <h3 className="text-sm font-bold leading-snug">{product.name}</h3>
        <div className="flex items-baseline justify-between gap-2">
          <span className={T_DATA}>{formatPesos(product.basePrice)}</span>
          <span className="text-xs text-text-secondary">{printsLabel(product.activeVariantCount)}</span>
        </div>
        {product.prints.length > 0 ? (
          <div className="flex items-center gap-1" aria-hidden="true">
            {product.prints.map((print) => (
              <ImageTile
                key={print.id}
                url={print.image.url}
                alt=""
                className="h-7 w-7 rounded-full border-2 border-ink"
              />
            ))}
            {hidden > 0 ? <span className="font-mono text-2xs text-text-muted">+{hidden}</span> : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
};

export type { ProductCardProps };
export { ProductCard };
