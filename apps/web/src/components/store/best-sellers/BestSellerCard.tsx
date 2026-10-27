import type { PublicProductSummary } from "@gira/shared";
import { PriceTag } from "@/components/store/PriceTag";
import { productRoute } from "@/lib/store/routes";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { cn } from "@/lib/cn";
import { AddToCartButton } from "./AddToCartButton";
import { cardImageUrl } from "./cardImage";

interface BestSellerCardProps {
  product: PublicProductSummary;
  authenticated: boolean;
  /** Position in the track: staggers the entrance. */
  index: number;
}

/**
 * Tin-label card: a band in the category's colour with the name, a softer band
 * with up to three words, the photo (a link to the product; a second photo
 * shows while hovering, instantly) and the price with its cart button.
 */
const BestSellerCard = ({ product, authenticated, index }: BestSellerCardProps) => {
  const card = product.card;
  if (!card) return null;
  const tone = CATEGORY_TONE[product.category.color];
  const [main, hover] = card.images;
  const words = product.cardTags.join(", ");

  return (
    <article
      style={{ ["--i" as string]: Math.min(index + 1, 6) }}
      className="best-card reveal-item flex flex-col overflow-hidden rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb"
    >
      <h3 className={cn("flex min-h-[5.25rem] items-center justify-center border-b-2 border-ink px-4 py-3 text-center font-display text-2xl uppercase leading-none", tone.strong)}>
        {product.name}
      </h3>
      {words ? (
        <p className={cn("border-b-2 border-ink px-3 py-3.5 text-center text-base font-bold uppercase leading-snug tracking-wide", tone.soft)}>
          {words}
        </p>
      ) : null}
      <a href={productRoute(product.slug)} aria-label={`Ver ${product.name}`} className="best-photo relative block aspect-[4/5] grow overflow-hidden bg-surface-sunken">
        {main ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
          <img src={cardImageUrl(main.url)} alt="" width={640} height={800} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        ) : null}
        {hover ? (
          // eslint-disable-next-line @next/next/no-img-element -- same as above
          <img src={cardImageUrl(hover.url)} alt="" width={640} height={800} loading="lazy" decoding="async" className="best-photo-hover absolute inset-0 size-full object-cover" />
        ) : null}
      </a>
      <div className={cn("flex items-center justify-between gap-2 border-t-2 border-ink px-4 py-3", tone.soft)}>
        <PriceTag price={card.price} compareAtPrice={card.compareAtPrice} className="text-lg" />
        <AddToCartButton variantId={card.variantId} productName={product.name} isAvailable={card.isAvailable} authenticated={authenticated} />
      </div>
    </article>
  );
};

export type { BestSellerCardProps };
export { BestSellerCard };
