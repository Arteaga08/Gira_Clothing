import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatalogBanner } from "@/components/store/catalog/CatalogBanner";
import { CatalogCategories } from "@/components/store/catalog/CatalogCategories";
import { CatalogGrid } from "@/components/store/catalog/CatalogGrid";
import { CatalogMessage } from "@/components/store/catalog/CatalogMessage";
import { CatalogPager } from "@/components/store/catalog/CatalogPager";
import { CatalogSort } from "@/components/store/catalog/CatalogSort";
import { CatalogSuggestions } from "@/components/store/catalog/CatalogSuggestions";
import { loadSession } from "@/lib/api/session";
import { getCatalogPage, getCategories } from "@/lib/api/storefront";
import { catalogHref, parseCatalogQuery, withCategory, withPage, type SearchParams } from "@/lib/store/catalogQuery";

const metadata: Metadata = { title: "Tienda" };

interface ShopPageProps {
  searchParams: Promise<SearchParams>;
}

/**
 * Catalog of the store (M14a): banner of the chosen category, category tiles,
 * order, four-per-row listing with pager, and suggestions. Every filter lives
 * in the URL, so the page is a plain server render of it.
 */
const ShopPage = async ({ searchParams }: ShopPageProps) => {
  const query = parseCatalogQuery(await searchParams);
  const [catalog, categories, session] = await Promise.all([getCatalogPage(query), getCategories(), loadSession()]);
  const authenticated = session.kind === "authenticated";

  // A page past the end (a stale link) lands on the last real page.
  if (catalog.status === "ok" && catalog.meta.pages > 0 && query.page > catalog.meta.pages) {
    redirect(catalogHref(withPage(query, catalog.meta.pages)));
  }

  const category = categories.find((item) => item.slug === query.category);
  const filtered = query.category !== undefined || query.print !== undefined || query.newArrival;
  const clearHref = catalogHref(withCategory({ ...query, print: undefined, newArrival: false }, undefined));
  const products = catalog.status === "ok" ? catalog.products : [];

  return (
    <>
      <CatalogBanner category={category} newArrivalsOnly={query.newArrival && category === undefined} />
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-10 px-4 pb-14 pt-10 md:px-8 md:pb-20">
        {categories.length > 0 ? <CatalogCategories categories={categories} query={query} /> : null}
        {catalog.status === "ok" ? <CatalogSort query={query} total={catalog.meta.total} /> : null}
        {catalog.status === "error" ? (
          <CatalogMessage variant="error" href={catalogHref(query)} />
        ) : products.length === 0 ? (
          <CatalogMessage variant="empty" href={clearHref} filtered={filtered} />
        ) : (
          <>
            <CatalogGrid products={products} authenticated={authenticated} />
            <CatalogPager query={query} pages={catalog.status === "ok" ? catalog.meta.pages : 1} />
          </>
        )}
      </div>
      <CatalogSuggestions shownSlugs={products.map((product) => product.slug)} authenticated={authenticated} />
    </>
  );
};

export { metadata };
export default ShopPage;
