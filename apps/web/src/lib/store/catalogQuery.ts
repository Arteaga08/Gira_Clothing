import { STORE_ROUTES } from "./routes";

/** Sort options of the catalog. `param` goes in the URL (`orden`), `api` is what `GET /catalog/products` takes. */
const CATALOG_SORTS = [
  { value: "novedades", label: "Novedades", api: "-createdAt" },
  { value: "precio-asc", label: "Precio: menor a mayor", api: "basePrice" },
  { value: "precio-desc", label: "Precio: mayor a menor", api: "-basePrice" },
  { value: "az", label: "A a Z", api: "name" },
  { value: "za", label: "Z a A", api: "-name" },
] as const;

type CatalogSortValue = (typeof CATALOG_SORTS)[number]["value"];

const DEFAULT_SORT: CatalogSortValue = "novedades";
/** Four per row, two rows per page. */
const CATALOG_PAGE_SIZE = 8;
const MAX_PAGE = 500;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 80;

interface CatalogQuery {
  /** Category slug (`categoria`). */
  category?: string | undefined;
  /** Print slug (`estampa`). */
  print?: string | undefined;
  /** Only products flagged «Novedad» (`novedad=si`). */
  newArrival: boolean;
  sort: CatalogSortValue;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

const parseSlug = (value: string | string[] | undefined): string | undefined => {
  const slug = first(value);
  return slug && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug) ? slug : undefined;
};

const parseSort = (value: string | string[] | undefined): CatalogSortValue => {
  const sort = first(value);
  return CATALOG_SORTS.find((option) => option.value === sort)?.value ?? DEFAULT_SORT;
};

const parsePage = (value: string | string[] | undefined): number => {
  const raw = first(value);
  if (!raw || !/^\d+$/.test(raw)) return 1;
  return Math.min(Math.max(Number.parseInt(raw, 10), 1), MAX_PAGE);
};

/** Reads the URL's filters; anything unknown or malformed falls back to the default (never an error page). */
const parseCatalogQuery = (params: SearchParams): CatalogQuery => ({
  category: parseSlug(params.categoria),
  print: parseSlug(params.estampa),
  newArrival: first(params.novedad) === "si",
  sort: parseSort(params.orden),
  page: parsePage(params.pagina),
});

/** Query string for `GET /catalog/products`: the URL's Spanish keys mapped to the API's. */
const buildCatalogApiQuery = (query: CatalogQuery): string => {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("limit", String(CATALOG_PAGE_SIZE));
  params.set("sort", CATALOG_SORTS.find((option) => option.value === query.sort)?.api ?? "-createdAt");
  if (query.category) params.set("category", query.category);
  if (query.print) params.set("print", query.print);
  if (query.newArrival) params.set("newArrival", "true");
  return `?${params.toString()}`;
};

/** Address of the catalog for a query; defaults (first page, newest first) are left out. */
const catalogHref = (query: CatalogQuery): string => {
  const params = new URLSearchParams();
  if (query.category) params.set("categoria", query.category);
  if (query.print) params.set("estampa", query.print);
  if (query.newArrival) params.set("novedad", "si");
  if (query.sort !== DEFAULT_SORT) params.set("orden", query.sort);
  if (query.page > 1) params.set("pagina", String(query.page));
  const search = params.toString();
  return search ? `${STORE_ROUTES.shop}?${search}` : STORE_ROUTES.shop;
};

/** Changing the category (or the sort) starts again at page 1; the other filters stay. */
const withCategory = (query: CatalogQuery, category: string | undefined): CatalogQuery => ({ ...query, category, page: 1 });
const withSort = (query: CatalogQuery, sort: CatalogSortValue): CatalogQuery => ({ ...query, sort, page: 1 });
const withPage = (query: CatalogQuery, page: number): CatalogQuery => ({ ...query, page });

export type { CatalogQuery, CatalogSortValue, SearchParams };
export { CATALOG_SORTS, CATALOG_PAGE_SIZE, DEFAULT_SORT, parseCatalogQuery, buildCatalogApiQuery, catalogHref, withCategory, withSort, withPage };
