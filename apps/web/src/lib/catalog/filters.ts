import { isObjectId } from "@/lib/inventory/variantId";

/** `category` sorts by the category NAME and then the model's; the rest map to the model's own fields. */
const CATALOG_SORT_FIELDS = ["category", "name", "basePrice", "updatedAt"] as const;
const DEFAULT_SORT = "category";
const DEFAULT_LIMIT = 100;
const MAX_SEARCH_LENGTH = 80;

type CatalogStatus = "active" | "retired" | "all";
const DEFAULT_STATUS: CatalogStatus = "active";

/** URL value (Spanish) -> panel value. */
const STATUS_URL_VALUES: Readonly<Record<string, CatalogStatus>> = {
  activos: "active",
  retirados: "retired",
  todos: "all",
};
const STATUS_TO_URL: Readonly<Record<CatalogStatus, string>> = {
  active: "activos",
  retired: "retirados",
  all: "todos",
};

interface CatalogFilters {
  category?: string;
  status: CatalogStatus;
  search?: string;
  sort: string;
  page: number;
}

/** A change to the filters: optional keys may be `undefined`, which means "clear this filter". */
interface CatalogFilterPatch {
  category?: string | undefined;
  status?: CatalogStatus;
  search?: string | undefined;
  sort?: string;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isAllowedSort = (value: string): boolean =>
  (CATALOG_SORT_FIELDS as readonly string[]).includes(value.replace(/^-/, ""));

const parseCatalogFilters = (params: RawParams): CatalogFilters => {
  const rawCategory = firstOf(params.categoria);
  const rawSort = firstOf(params.orden);
  const search = firstOf(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number(firstOf(params.page));

  const filters: CatalogFilters = {
    status: STATUS_URL_VALUES[firstOf(params.estado) ?? ""] ?? DEFAULT_STATUS,
    sort: rawSort && isAllowedSort(rawSort) ? rawSort : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (rawCategory && isObjectId(rawCategory)) filters.category = rawCategory;
  if (search) filters.search = search;
  return filters;
};

/** Query string for GET /admin/products. */
const buildProductListQuery = (filters: CatalogFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  if (filters.status === "active") query.set("isActive", "true");
  if (filters.status === "retired") query.set("isActive", "false");
  if (filters.category) query.set("category", filters.category);
  if (filters.search) query.set("search", filters.search);
  query.set("sort", filters.sort);
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: CatalogFilters): string => {
  const params = new URLSearchParams();
  if (filters.status !== DEFAULT_STATUS) params.set("estado", STATUS_TO_URL[filters.status]);
  if (filters.category) params.set("categoria", filters.category);
  if (filters.search) params.set("q", filters.search);
  if (filters.sort !== DEFAULT_SORT) params.set("orden", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
};

/** Applies a patch. Any change other than the page itself goes back to page 1: a new filter makes the old page meaningless. */
const applyFilterPatch = (current: CatalogFilters, patch: CatalogFilterPatch): CatalogFilters => {
  const merged: CatalogFilters = {
    status: patch.status ?? current.status,
    sort: patch.sort ?? current.sort,
    page: patch.page ?? 1,
  };
  const category = "category" in patch ? patch.category : current.category;
  const search = "search" in patch ? patch.search : current.search;
  if (category) merged.category = category;
  if (search) merged.search = search;
  return merged;
};

/** True when something other than sort/page narrows the list: the empty state's wording depends on it. */
const hasActiveFilters = (filters: CatalogFilters): boolean =>
  Boolean(filters.category ?? filters.search) || filters.status !== DEFAULT_STATUS;

export {
  CATALOG_SORT_FIELDS,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  DEFAULT_STATUS,
  parseCatalogFilters,
  buildProductListQuery,
  toSearchParams,
  applyFilterPatch,
  hasActiveFilters,
};
export type { CatalogFilters, CatalogFilterPatch, CatalogStatus };
