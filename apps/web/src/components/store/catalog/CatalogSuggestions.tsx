import { getBestSellers, getNewArrivals } from "@/lib/api/storefront";
import { SuggestionsTrack } from "./SuggestionsTrack";

const SUGGESTIONS_LIMIT = 8;

interface CatalogSuggestionsProps {
  /** Slugs already listed on the page: a suggestion never repeats them. */
  shownSlugs: string[];
  authenticated: boolean;
}

/**
 * «Te va a gustar»: the products flagged «Más vendido», then the ones flagged
 * «Novedad» to fill the row, without repeating what the page already lists or
 * each other. Nothing left to suggest, no section.
 */
const CatalogSuggestions = async ({ shownSlugs, authenticated }: CatalogSuggestionsProps) => {
  const shown = new Set(shownSlugs);
  const [bestSellers, newArrivals] = await Promise.all([getBestSellers(), getNewArrivals()]);
  const products = [...bestSellers, ...newArrivals]
    .filter((product) => {
      if (shown.has(product.slug)) return false;
      shown.add(product.slug);
      return true;
    })
    .slice(0, SUGGESTIONS_LIMIT);
  if (products.length === 0) return null;
  return <SuggestionsTrack products={products} authenticated={authenticated} />;
};

export type { CatalogSuggestionsProps };
export { CatalogSuggestions };
