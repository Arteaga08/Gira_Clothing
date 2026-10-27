"use client";

import { X } from "@phosphor-icons/react";
import type { Wire, WishlistItem } from "@gira/shared";
import { AddToCartButton } from "@/components/store/best-sellers/AddToCartButton";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import { PriceTag } from "@/components/store/PriceTag";
import { IconButton } from "@/components/ui/IconButton";
import { T_PRODUCT_TITLE } from "@/components/ui/typography";
import { productRoute } from "@/lib/store/routes";

interface SavedCardProps {
  item: Wire<WishlistItem>;
  onRemove: (variantId: string) => void;
}

/**
 * One saved variant: photo (a link to the product), name, print, live price
 * (struck-through previous one while on sale) and the cart button. A sold-out
 * one keeps its card with «Sin existencias» and no way to add it.
 */
const SavedCard = ({ item, onRemove }: SavedCardProps) => {
  const [main] = item.images;

  return (
    <li className="relative flex flex-col overflow-hidden rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb">
      <a href={productRoute(item.productSlug)} aria-label={`Ver ${item.productName}`} className="relative block aspect-[4/5] overflow-hidden bg-surface-sunken">
        {main ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
          <img src={cardImageUrl(main.url)} alt="" width={640} height={800} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        ) : null}
      </a>
      <IconButton
        variant="danger"
        icon={X}
        label={`Quitar ${item.productName} de guardados`}
        onClick={() => onRemove(item.variantId)}
        className="absolute right-3 top-3"
      />
      <div className="grid gap-1 border-t-2 border-ink px-4 py-3">
        <h2 className={T_PRODUCT_TITLE}>{item.productName}</h2>
        <p className="font-mono text-xs font-bold uppercase text-text-secondary">{item.printName}</p>
        <PriceTag price={item.price} compareAtPrice={item.compareAtPrice} className="text-lg" />
        <div className="mt-2 flex items-center gap-2">
          {item.isAvailable ? (
            <AddToCartButton variantId={item.variantId} productName={item.productName} isAvailable authenticated />
          ) : (
            <p className="rounded-nb-sm border-2 border-ink bg-surface-sunken px-3 py-1.5 text-sm font-bold">Sin existencias</p>
          )}
        </div>
      </div>
    </li>
  );
};

export type { SavedCardProps };
export { SavedCard };
