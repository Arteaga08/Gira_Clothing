import type { PublicProductDetail, PublicProductVariant } from "@gira/shared";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import { T_LABEL } from "@/components/ui/typography";
import { formatPesos } from "@/lib/catalog/money";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { categoryRoute } from "@/lib/store/routes";
import { cn } from "@/lib/cn";

interface ProductIntroProps {
  product: PublicProductDetail;
  /** The chosen variant; absent when the model has none yet. */
  variant: PublicProductVariant | undefined;
  unitPrice: number;
}

/**
 * Left column: category chip, the name big in Anton (the page's only `h1`),
 * the price, the description, the chosen print in macro on the category's
 * strong colour, and a two-cell strip with the print and its availability.
 */
const ProductIntro = ({ product, variant, unitPrice }: ProductIntroProps) => {
  const tone = CATEGORY_TONE[product.category.color];

  return (
    <div className="flex min-w-0 flex-col">
      <div className="grid gap-3 px-5 pb-5 pt-6 md:px-8 md:pt-8">
        <a
          href={categoryRoute(product.category.slug)}
          className={cn("justify-self-start rounded-full border-2 border-ink px-3 py-1 font-mono text-xs font-bold uppercase", tone.strong)}
        >
          {product.category.name}
        </a>
        <h1 className="break-words font-display text-[clamp(3.5rem,6.2vw,6rem)] uppercase leading-[1.06]">{product.name}</h1>
        <p className="font-mono text-3xl font-bold text-accent">{formatPesos(unitPrice)}</p>
      </div>
      {product.description ? (
        <p className="border-t-2 border-ink px-5 py-4 text-[1.0625rem] leading-relaxed text-text-secondary md:px-8 md:py-5">{product.description}</p>
      ) : null}
      {variant ? (
        <>
          <div className={cn("grid min-h-56 flex-1 place-items-center border-t-2 border-ink p-5", tone.strong)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured */}
            <img
              src={cardImageUrl(variant.print.image.url)}
              alt={`Estampa ${variant.print.name} en detalle`}
              loading="lazy"
              decoding="async"
              className="aspect-square w-full max-w-[18.75rem] rounded-nb-sm border-2 border-ink object-cover shadow-nb"
            />
          </div>
          <dl className="grid grid-cols-2 border-t-2 border-ink">
            <div className="grid gap-0.5 px-5 py-4 md:px-6">
              <dt className={cn(T_LABEL, "text-text-muted")}>Estampa</dt>
              <dd className="font-mono text-sm">{variant.print.name}</dd>
            </div>
            <div className="grid gap-0.5 border-l-2 border-ink px-5 py-4 md:px-6">
              <dt className={cn(T_LABEL, "text-text-muted")}>Estado</dt>
              <dd className="font-mono text-sm">{variant.isAvailable ? "Disponible" : "Agotada"}</dd>
            </div>
          </dl>
        </>
      ) : null}
    </div>
  );
};

export type { ProductIntroProps };
export { ProductIntro };
