import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { PublicCategorySummary } from "@/lib/api/storefront";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { categoryRoute } from "@/lib/store/routes";
import { cn } from "@/lib/cn";
import { Flower, Star } from "./Ornaments";
import { WaveEdge } from "./WaveEdge";

interface CategoryTileProps {
  category: PublicCategorySummary;
  /** Position in the grid: staggers the entrance and alternates the fallback ornament. */
  index: number;
}

/**
 * Poster of one category: its photo at full 4:5 (never zoomed or cropped by
 * the page; the team uploads it in that ratio) above a label in the category's
 * colour with a wavy top. With no photo, a soft colour field and an ornament
 * stand in.
 */
const CategoryTile = ({ category, index }: CategoryTileProps) => {
  const tone = CATEGORY_TONE[category.color];
  const Ornament = index % 2 === 0 ? Flower : Star;

  return (
    <li style={{ ["--i" as string]: Math.min(index + 1, 6) }} className="cat-tile reveal-item">
      <a
        href={categoryRoute(category.slug)}
        aria-label={`Ver ${category.name}`}
        className="flex h-full flex-col overflow-hidden rounded-nb border-2 border-ink bg-surface shadow-nb"
      >
        <div className={cn("relative aspect-[4/5] overflow-hidden", tone.soft)}>
          {category.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
            <img
              src={cardImageUrl(category.image.url)}
              alt=""
              width={640}
              height={800}
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center">
              <Ornament className="size-1/2" />
            </div>
          )}
          <span
            className={cn(
              "cat-tile-arrow absolute right-3 top-3 grid size-10 place-items-center rounded-full border-2 border-ink shadow-nb",
              tone.soft,
            )}
          >
            <ArrowUpRight aria-hidden="true" weight="bold" className="size-5 text-ink" />
          </span>
        </div>
        <div className="relative -mt-[17px] grow">
          <WaveEdge fill={`var(--color-cat-${category.color})`} className="block h-[18px] w-full" />
          <div className={cn("-mt-px h-full px-4 pb-4 pt-1", tone.strong)}>
            <span className="block font-display text-3xl uppercase leading-[0.95] text-ink md:text-4xl">
              {category.name}
            </span>
            {category.description ? (
              <span className="mt-1 hidden truncate text-sm font-bold text-ink md:block">
                {category.description}
              </span>
            ) : null}
          </div>
        </div>
      </a>
    </li>
  );
};

export type { CategoryTileProps };
export { CategoryTile };
