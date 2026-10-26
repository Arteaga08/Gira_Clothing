import type { PublicProductSummary } from "@gira/shared";
import { formatPesos } from "@/lib/catalog/money";
import { productRoute } from "@/lib/store/routes";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { cn } from "@/lib/cn";
import { AddToCartButton } from "@/components/store/best-sellers/AddToCartButton";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";

interface NewArrivalTileProps {
  product: PublicProductSummary;
  authenticated: boolean;
  /** The newest one: the large tile, with the starburst and the card words. */
  lead: boolean;
  /** Position in the bento: staggers the entrance. */
  index: number;
}

const LEAD_PHOTO_WIDTH = 1080;

/**
 * One tile of «Novedades»: the photo (a link to the product) with a price tag
 * hanging over it, in the category's colour, carrying the name, the price and
 * the cart button. The lead tile adds a starburst and the card words.
 */
const NewArrivalTile = ({ product, authenticated, lead, index }: NewArrivalTileProps) => {
  const card = product.card;
  if (!card) return null;
  const [photo] = card.images;
  const words = product.cardTags.join(", ");

  return (
    <article style={{ ["--i" as string]: Math.min(index + 2, 7) }} className="new-tile reveal-item" data-lead={lead}>
      <a href={productRoute(product.slug)} aria-label={`Ver ${product.name}`} className="new-tile-photo">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
          <img
            src={cardImageUrl(photo.url, lead ? LEAD_PHOTO_WIDTH : undefined)}
            alt=""
            width={lead ? LEAD_PHOTO_WIDTH : 640}
            height={lead ? 1350 : 800}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </a>
      {lead ? (
        <p className="new-burst" aria-hidden="true">
          <span>¡Nuevo!</span>
        </p>
      ) : null}
      <div className={cn("new-tag", CATEGORY_TONE[product.category.color].strong)}>
        <h3 className="new-tag-name">{product.name}</h3>
        {lead && words ? <p className="new-tag-words">{words}</p> : null}
        <div className="new-tag-row">
          <span className="font-mono text-lg font-bold">{formatPesos(card.price)}</span>
          <AddToCartButton variantId={card.variantId} productName={product.name} isAvailable={card.isAvailable} authenticated={authenticated} />
        </div>
      </div>
    </article>
  );
};

export type { NewArrivalTileProps };
export { NewArrivalTile };
