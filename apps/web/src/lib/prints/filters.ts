import { isObjectId } from "@/lib/inventory/variantId";

const PRINT_SORT_FIELDS = ["name", "sku", "updatedAt"] as const;
const DEFAULT_SORT = "name";
const DEFAULT_LIMIT = 24;
const MAX_SEARCH_LENGTH = 80;

type PrintStatus = "active" | "retired" | "all";
const DEFAULT_STATUS: PrintStatus = "active";

/** URL value (Spanish) -> panel value. */
const STATUS_URL_VALUES: Readonly<Record<string, PrintStatus>> = {
  activas: "active",
  retiradas: "retired",
  todas: "all",
};
const STATUS_TO_URL: Readonly<Record<PrintStatus, string>> = {
  active: "activas",
  retired: "retiradas",
  all: "todas",
};

interface PrintFilters {
  family?: string;
  status: PrintStatus;
  search?: string;
  sort: string;
  page: number;
}

/** A change to the filters: optional keys may be `undefined`, which means "clear this filter". */
interface PrintFilterPatch {
  family?: string | undefined;
  status?: PrintStatus;
  search?: string | undefined;
  sort?: string;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isAllowedSort = (value: string): boolean =>
  (PRINT_SORT_FIELDS as readonly string[]).includes(value.replace(/^-/, ""));

const parsePrintFilters = (params: RawParams): PrintFilters => {
  const rawFamily = firstOf(params.familia);
  const rawSort = firstOf(params.orden);
  const search = firstOf(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number(firstOf(params.page));

  const filters: PrintFilters = {
    status: STATUS_URL_VALUES[firstOf(params.estado) ?? ""] ?? DEFAULT_STATUS,
    sort: rawSort && isAllowedSort(rawSort) ? rawSort : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (rawFamily && isObjectId(rawFamily)) filters.family = rawFamily;
  if (search) filters.search = search;
  return filters;
};

/** The print the side panel shows: `"nueva"` for the create form, a valid id for an existing one. */
const parseSelectedPrint = (params: RawParams): string | undefined => {
  const raw = firstOf(params.estampa);
  if (raw === "nueva") return raw;
  return raw && isObjectId(raw) ? raw : undefined;
};

/** Query string for GET /admin/prints. */
const buildPrintListQuery = (filters: PrintFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  if (filters.status === "active") query.set("isActive", "true");
  if (filters.status === "retired") query.set("isActive", "false");
  if (filters.family) query.set("family", filters.family);
  if (filters.search) query.set("search", filters.search);
  query.set("sort", filters.sort);
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: PrintFilters, selected?: string): string => {
  const params = new URLSearchParams();
  if (filters.status !== DEFAULT_STATUS) params.set("estado", STATUS_TO_URL[filters.status]);
  if (filters.family) params.set("familia", filters.family);
  if (filters.search) params.set("q", filters.search);
  if (filters.sort !== DEFAULT_SORT) params.set("orden", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (selected) params.set("estampa", selected);
  return params.toString();
};

/** Applies a patch. Any change other than the page itself goes back to page 1: a new filter makes the old page meaningless. */
const applyFilterPatch = (current: PrintFilters, patch: PrintFilterPatch): PrintFilters => {
  const merged: PrintFilters = {
    status: patch.status ?? current.status,
    sort: patch.sort ?? current.sort,
    page: patch.page ?? 1,
  };
  const family = "family" in patch ? patch.family : current.family;
  const search = "search" in patch ? patch.search : current.search;
  if (family) merged.family = family;
  if (search) merged.search = search;
  return merged;
};

/** True when something other than sort/page narrows the list: the empty state's wording depends on it. */
const hasActiveFilters = (filters: PrintFilters): boolean =>
  Boolean(filters.family ?? filters.search) || filters.status !== DEFAULT_STATUS;

export {
  PRINT_SORT_FIELDS,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  DEFAULT_STATUS,
  parsePrintFilters,
  parseSelectedPrint,
  buildPrintListQuery,
  toSearchParams,
  applyFilterPatch,
  hasActiveFilters,
};
export type { PrintFilters, PrintFilterPatch, PrintStatus };
