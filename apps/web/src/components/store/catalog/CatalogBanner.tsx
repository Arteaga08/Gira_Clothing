import type { CSSProperties } from "react";
import type { CategoryColor } from "@gira/shared";
import { Flower, Star } from "@/components/store/categories/Ornaments";
import { bannerImageUrl } from "@/components/store/offer-banner/bannerImage";
import type { PublicCategorySummary } from "@/lib/api/storefront";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { cn } from "@/lib/cn";
import { Asterisk, RoundSticker, Sparkle, Squiggle } from "./CatalogOrnaments";

interface CatalogBannerProps {
  /** The chosen category; without one the banner introduces the whole catalog. */
  category?: PublicCategorySummary | undefined;
  /** Only «Novedad» products are listed (and no category is chosen). */
  newArrivalsOnly?: boolean;
}

/** Ornament colour: the rosa of the brand, except where the panel is already rosa or cereza. */
const DECOR_FILL: Partial<Record<CategoryColor, string>> = {
  pink: "var(--color-tile-alt)",
  cherry: "var(--color-brand-subtle)",
};
const DEFAULT_DECOR_FILL = "var(--color-accent)";

/**
 * Top of the catalog: the category's photo edge to edge with a coloured text
 * panel over it (the category's colour; hueso is never a fill here, so a hueso
 * category takes menta) and printed-sticker ornaments. Without a photo, a
 * colour field with big ornaments takes its place. The only `h1` of the page.
 */
const CatalogBanner = ({ category, newArrivalsOnly = false }: CatalogBannerProps) => {
  const color: CategoryColor = category && category.color !== "bone" ? category.color : "mint";
  const tone = CATEGORY_TONE[color];
  const decor = DECOR_FILL[color] ?? DEFAULT_DECOR_FILL;
  const image = category?.image;

  const kicker = category ? "Categoría" : newArrivalsOnly ? "Lo más reciente" : "Catálogo completo";
  const title = category ? category.name : newArrivalsOnly ? "Novedades" : "Todo lo que trae la gira";
  const description = category
    ? category.description
    : newArrivalsOnly
      ? "Lo último que llegó a la tienda."
      : "Prendas con estampa propia. Elige una categoría o recorre todo.";

  return (
    <section
      aria-labelledby="catalog-title"
      style={{ "--decor": decor } as CSSProperties}
      className={cn("relative min-h-[clamp(21rem,46vw,35rem)] overflow-hidden border-b-2 border-ink", image ? "bg-ink" : category ? tone.soft : "bg-tile-alt")}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
        <img src={bannerImageUrl(image.url)} alt="" width={image.width} height={image.height} decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 hidden md:block">
          <Flower className="absolute -right-10 top-1/2 size-[30rem] -translate-y-1/2" />
          <Star className="absolute right-[26rem] top-10 size-28" />
        </div>
      )}
      <div className="relative mx-auto flex min-h-[inherit] w-full max-w-[96rem] items-center px-4 py-10 md:px-8">
        <div className={cn("relative w-full max-w-[35rem] rounded-nb border-2 border-ink p-6 pb-14 shadow-nb-lg md:p-10 md:pb-16", tone.strong)}>
          <p className="font-mono text-xs font-bold uppercase text-ink">{kicker}</p>
          <h1 id="catalog-title" className="mt-3 font-display text-[clamp(3rem,6.5vw,6rem)] uppercase leading-[0.95] text-ink">
            {title}
          </h1>
          {description ? <p className="mt-4 max-w-[34ch] text-lg text-ink">{description}</p> : null}

          <div aria-hidden="true" className="pointer-events-none">
            <RoundSticker fill="var(--decor)" className="catalog-sticker absolute -right-5 -top-9 size-24 md:-right-14 md:-top-12 md:size-32" />
            <Asterisk className="absolute right-28 top-4 hidden size-8 md:block" />
            <i className="absolute right-12 top-24 hidden size-3.5 rounded-full border-2 border-ink bg-[var(--decor)] md:block" />
            <i className="absolute right-8 top-32 hidden size-2 rounded-full bg-ink md:block" />
            <Sparkle className="absolute bottom-5 right-5 size-10 md:size-12" />
            <Sparkle fill="var(--decor)" className="absolute bottom-12 right-16 size-5" />
            <Squiggle className="absolute bottom-4 left-6 w-36 md:left-10" />
            <Sparkle fill="var(--decor)" className="absolute left-[calc(100%+3rem)] top-6 hidden size-16 lg:block" />
            <Sparkle fill="var(--color-tile-alt)" className="absolute bottom-4 left-[calc(100%+1.5rem)] hidden size-8 lg:block" />
          </div>
        </div>
      </div>
    </section>
  );
};

export type { CatalogBannerProps };
export { CatalogBanner };
