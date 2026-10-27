import Link from "next/link";
import { Flower, Star } from "@/components/store/categories/Ornaments";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import type { PublicCategorySummary } from "@/lib/api/storefront";
import { catalogHref, withCategory, type CatalogQuery } from "@/lib/store/catalogQuery";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { cn } from "@/lib/cn";

interface CatalogCategoriesProps {
  categories: PublicCategorySummary[];
  query: CatalogQuery;
}

const TILE =
  "relative flex aspect-[1/1.05] flex-col justify-end overflow-hidden rounded-nb border-2 border-ink shadow-nb transition-[translate,box-shadow] duration-200 hover:-translate-x-px hover:-translate-y-px hover:shadow-nb-lg motion-reduce:transition-none";

/**
 * One tile per category, plus «Todo». Each takes its own colour (the strong
 * fill for the name) over its photo; the chosen one turns ink. They are links:
 * the filter lives in the URL, so it can be shared and survives a reload.
 */
const CatalogCategories = ({ categories, query }: CatalogCategoriesProps) => {
  const allSelected = query.category === undefined;

  return (
    <nav aria-label="Categorías">
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <li>
          <Link
            href={catalogHref(withCategory(query, undefined))}
            aria-current={allSelected ? "true" : undefined}
            className={cn(TILE, "h-full justify-center px-4 text-ink", allSelected ? "bg-ink text-text-inverse" : "bg-brand-subtle")}
          >
            {allSelected ? null : <Star className="absolute right-3 top-3 size-10" />}
            <span className="font-display text-5xl uppercase leading-none">Todo</span>
          </Link>
        </li>
        {categories.map((category, index) => {
          const Ornament = index % 2 === 0 ? Flower : Star;
          const selected = query.category === category.slug;
          return (
            <li key={category.id}>
              <Link
                href={catalogHref(withCategory(query, category.slug))}
                aria-current={selected ? "true" : undefined}
                className={cn(TILE, "h-full", selected ? "bg-ink" : CATEGORY_TONE[category.color].strong)}
              >
                <span className={cn("absolute inset-x-0 top-0 bottom-14 overflow-hidden border-b-2 border-ink", CATEGORY_TONE[category.color].soft)}>
                  {category.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
                    <img src={cardImageUrl(category.image.url, 480)} alt="" width={480} height={600} loading="lazy" decoding="async" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center">
                      <Ornament className="size-1/2" />
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "relative flex h-14 items-center px-3.5 font-display text-2xl uppercase leading-none",
                    selected ? "bg-ink text-text-inverse" : "text-ink",
                  )}
                >
                  {category.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export type { CatalogCategoriesProps };
export { CatalogCategories };
