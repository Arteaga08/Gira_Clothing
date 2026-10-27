import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { catalogHref, withPage, type CatalogQuery } from "@/lib/store/catalogQuery";
import { pagerItems } from "@/lib/store/catalogPager";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { cn } from "@/lib/cn";

interface CatalogPagerProps {
  query: CatalogQuery;
  pages: number;
}

/** Each page number keeps its own colour (they cycle), so none melts into the green page. */
const NUMBER_TONES = [CATEGORY_TONE.pink, CATEGORY_TONE.mint, CATEGORY_TONE.tangerine, CATEGORY_TONE.sky, CATEGORY_TONE.ikat] as const;

const BOX =
  "grid size-11 place-items-center rounded-nb border-2 border-ink font-mono text-base font-bold text-ink shadow-nb-sm transition-[translate,box-shadow] motion-reduce:transition-none";
const LIFT = "hover:-translate-x-px hover:-translate-y-px hover:shadow-nb";

/**
 * Page links. The current page is pressed in (no shadow) and ringed in hueso;
 * the arrows are lila («edit»: navigate) and go quiet at the ends.
 */
const CatalogPager = ({ query, pages }: CatalogPagerProps) => {
  if (pages <= 1) return null;
  const hrefFor = (page: number) => catalogHref(withPage(query, page));

  return (
    <nav aria-label="Páginas del catálogo">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>
          {query.page > 1 ? (
            <Link href={hrefFor(query.page - 1)} aria-label="Página anterior" className={cn(BOX, LIFT, "bg-tile-alt")}>
              <ArrowLeft aria-hidden="true" weight="bold" className="size-5" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(BOX, "bg-tile-alt opacity-45 shadow-none")}>
              <ArrowLeft weight="bold" className="size-5" />
            </span>
          )}
        </li>
        {pagerItems(query.page, pages).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 font-mono text-lg font-bold text-text-inverse">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                aria-label={`Página ${item}`}
                aria-current={item === query.page ? "page" : undefined}
                className={cn(
                  BOX,
                  NUMBER_TONES[(item - 1) % NUMBER_TONES.length]?.strong,
                  item === query.page ? "translate-x-0.5 translate-y-0.5 shadow-none outline outline-[3px] outline-offset-[3px] outline-text-inverse" : LIFT,
                )}
              >
                {item}
              </Link>
            </li>
          ),
        )}
        <li>
          {query.page < pages ? (
            <Link href={hrefFor(query.page + 1)} aria-label="Página siguiente" className={cn(BOX, LIFT, "bg-tile-alt")}>
              <ArrowRight aria-hidden="true" weight="bold" className="size-5" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(BOX, "bg-tile-alt opacity-45 shadow-none")}>
              <ArrowRight weight="bold" className="size-5" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
};

export type { CatalogPagerProps };
export { CatalogPager };
