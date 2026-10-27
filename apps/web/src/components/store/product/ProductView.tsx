"use client";

import { useState } from "react";
import type { PublicProductDetail } from "@gira/shared";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { cn } from "@/lib/cn";
import { ProductIntro } from "./ProductIntro";
import { ProductStage } from "./ProductStage";
import { PurchasePanel } from "./PurchasePanel";

interface ProductViewProps {
  product: PublicProductDetail;
  authenticated: boolean;
}

/** The variant the catalog card showed, else the first one in stock, else the first. */
const initialIndex = (product: PublicProductDetail): number => {
  const fromCard = product.variants.findIndex((variant) => variant.id === product.card?.variantId);
  if (fromCard !== -1) return fromCard;
  const inStock = product.variants.findIndex((variant) => variant.isAvailable);
  return inStock !== -1 ? inStock : 0;
};

/**
 * Top of the product page (direction A, «Lata»): a framed panel in three
 * columns, all on the category's colour. The print chosen on the right drives
 * the photo in the middle, the macro on the left, the price and the cart line.
 * Narrower screens stack it: photo first, then the two side columns.
 */
const ProductView = ({ product, authenticated }: ProductViewProps) => {
  const [selected, setSelected] = useState(() => initialIndex(product));
  const [qty, setQty] = useState(1);
  const tone = CATEGORY_TONE[product.category.color];
  const variant = product.variants[selected];
  const unitPrice = variant?.price ?? 0;
  const photos = variant ? (variant.images.length > 0 ? variant.images : [variant.print.image]) : [];

  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-nb border-2 border-ink text-text-primary shadow-nb-lg md:grid-cols-2 lg:grid-cols-[1fr_1.3fr_1fr]",
        tone.soft,
      )}
    >
      <ProductIntro product={product} variant={variant} />
      <div className={cn("order-first border-b-2 border-ink md:col-span-2 lg:order-none lg:col-span-1 lg:border-x-2 lg:border-b-0", tone.strong)}>
        <ProductStage key={variant?.id ?? "none"} images={photos} alt={variant ? `${product.name}, estampa ${variant.print.name}` : product.name} />
      </div>
      <div className="border-t-2 border-ink md:border-l-2 md:border-t-0 lg:border-l-0">
        <PurchasePanel
          productName={product.name}
          variants={product.variants}
          selected={selected}
          onSelect={(index) => {
            setSelected(index);
            setQty(1);
          }}
          unitPrice={unitPrice}
          qty={qty}
          onQtyChange={setQty}
          authenticated={authenticated}
        />
      </div>
    </div>
  );
};

export type { ProductViewProps };
export { ProductView };
