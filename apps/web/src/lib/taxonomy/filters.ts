import { isObjectId } from "@/lib/inventory/variantId";

const TAXON_SORT_FIELDS = ["name", "updatedAt"] as const;
const DEFAULT_SORT = "name";
const DEFAULT_LIMIT = 24;
const MAX_SEARCH_LENGTH = 80;

type TaxonStatus = "active" | "retired" | "all";
const DEFAULT_STATUS: TaxonStatus = "active";

/** URL value (Spanish) -> panel value. */
const STATUS_URL_VALUES: Readonly<Record<string, TaxonStatus>> = {
  activas: "active",
  retiradas: "retired",
  todas: "all",
};
const STATUS_TO_URL: Readonly<Record<TaxonStatus, string>> = {
  active: "activas",
  retired: "retiradas",
  all: "todas",
};

interface TaxonFilters {
  status: TaxonStatus;
  search?: string;
  sort: string;
  page: number;
}

/** A change to the filters: `search: undefined` means "clear the search". */
interface TaxonFilterPatch {
  status?: TaxonStatus;
  search?: string | undefined;
  sort?: string;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isAllowedSort = (value: string): boolean =>
  (TAXON_SORT_FIELDS as readonly string[]).includes(value.replace(/^-/, ""));

const parseTaxonFilters = (params: RawParams): TaxonFilters => {
  const rawSort = firstOf(params.orden);
  const search = firstOf(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number(firstOf(params.page));

  const filters: TaxonFilters = {
    status: STATUS_URL_VALUES[firstOf(params.estado) ?? ""] ?? DEFAULT_STATUS,
    sort: rawSort && isAllowedSort(rawSort) ? rawSort : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (search) filters.search = search;
  return filters;
};

/** The record the modal shows: `"nueva"` for the create form, a valid id for an existing one. `param` is the URL key (`familia`, `categoria`). */
const parseSelectedTaxon = (params: RawParams, param: string): string | undefined => {
  const raw = firstOf(params[param]);
  if (raw === "nueva") return raw;
  return raw && isObjectId(raw) ? raw : undefined;
};

/** Query string for the admin list endpoints. */
const buildTaxonListQuery = (filters: TaxonFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  if (filters.status === "active") query.set("isActive", "true");
  if (filters.status === "retired") query.set("isActive", "false");
  if (filters.search) query.set("search", filters.search);
  query.set("sort", filters.sort);
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: TaxonFilters, param: string, selected?: string): string => {
  const params = new URLSearchParams();
  if (filters.status !== DEFAULT_STATUS) params.set("estado", STATUS_TO_URL[filters.status]);
  if (filters.search) params.set("q", filters.search);
  if (filters.sort !== DEFAULT_SORT) params.set("orden", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (selected) params.set(param, selected);
  return params.toString();
};

/** Applies a patch. Any change other than the page itself goes back to page 1: a new filter makes the old page meaningless. */
const applyFilterPatch = (current: TaxonFilters, patch: TaxonFilterPatch): TaxonFilters => {
  const merged: TaxonFilters = {
    status: patch.status ?? current.status,
    sort: patch.sort ?? current.sort,
    page: patch.page ?? 1,
  };
  const search = "search" in patch ? patch.search : current.search;
  if (search) merged.search = search;
  return merged;
};

/** True when something other than sort/page narrows the list: the empty state's wording depends on it. */
const hasActiveFilters = (filters: TaxonFilters): boolean =>
  Boolean(filters.search) || filters.status !== DEFAULT_STATUS;

export {
  TAXON_SORT_FIELDS,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  DEFAULT_STATUS,
  parseTaxonFilters,
  parseSelectedTaxon,
  buildTaxonListQuery,
  toSearchParams,
  applyFilterPatch,
  hasActiveFilters,
};
export type { TaxonFilters, TaxonFilterPatch, TaxonStatus };
