import type { CustomerRankPeriod, CustomerRankSort } from "@gira/shared";

const DEFAULT_PERIOD: CustomerRankPeriod = "month";
const DEFAULT_SORT: CustomerRankSort = "spent";
const DEFAULT_LIMIT = 20;
const MAX_SEARCH_LENGTH = 80;
/** The URL key that opens the «Dar cupón» modal on the detail page (`?cupon=nuevo`). */
const GIVE_COUPON_PARAM = "cupon";

/** Spanish words in the page URL; the API takes the English enum values. */
const PERIOD_TO_URL: Readonly<Record<CustomerRankPeriod, string>> = { today: "hoy", week: "semana", month: "mes" };
const URL_TO_PERIOD: Readonly<Record<string, CustomerRankPeriod>> = Object.fromEntries(
  Object.entries(PERIOD_TO_URL).map(([period, word]) => [word, period as CustomerRankPeriod]),
);
const SORT_TO_URL: Readonly<Record<CustomerRankSort, string>> = { spent: "gasto", orders: "compras" };
const URL_TO_SORT: Readonly<Record<string, CustomerRankSort>> = Object.fromEntries(
  Object.entries(SORT_TO_URL).map(([sort, word]) => [word, sort as CustomerRankSort]),
);

interface CustomerFilters {
  period: CustomerRankPeriod;
  sortBy: CustomerRankSort;
  search?: string;
  page: number;
}

/** `search: undefined` means "clear the search". */
interface CustomerFilterPatch {
  period?: CustomerRankPeriod;
  sortBy?: CustomerRankSort;
  search?: string | undefined;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const parseCustomerFilters = (params: RawParams): CustomerFilters => {
  const search = firstOf(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number(firstOf(params.page));
  const filters: CustomerFilters = {
    period: URL_TO_PERIOD[firstOf(params.periodo) ?? ""] ?? DEFAULT_PERIOD,
    sortBy: URL_TO_SORT[firstOf(params.orden) ?? ""] ?? DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (search) filters.search = search;
  return filters;
};

/** Query string for GET /admin/customers/top: only the ranking's own filters. */
const buildTopQuery = (filters: Pick<CustomerFilters, "period" | "sortBy">): string =>
  new URLSearchParams({ period: filters.period, sortBy: filters.sortBy }).toString();

/** Query string for GET /admin/customers: only the table's own filters. */
const buildCustomerListQuery = (filters: CustomerFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: CustomerFilters): string => {
  const params = new URLSearchParams();
  if (filters.period !== DEFAULT_PERIOD) params.set("periodo", PERIOD_TO_URL[filters.period]);
  if (filters.sortBy !== DEFAULT_SORT) params.set("orden", SORT_TO_URL[filters.sortBy]);
  if (filters.search) params.set("q", filters.search);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
};

/** Any change other than the page itself goes back to page 1. */
const applyFilterPatch = (current: CustomerFilters, patch: CustomerFilterPatch): CustomerFilters => {
  const merged: CustomerFilters = {
    period: patch.period ?? current.period,
    sortBy: patch.sortBy ?? current.sortBy,
    page: patch.page ?? 1,
  };
  const search = "search" in patch ? patch.search : current.search;
  if (search) merged.search = search;
  return merged;
};

export {
  DEFAULT_PERIOD,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  GIVE_COUPON_PARAM,
  PERIOD_TO_URL,
  parseCustomerFilters,
  buildTopQuery,
  buildCustomerListQuery,
  toSearchParams,
  applyFilterPatch,
};
export type { CustomerFilters, CustomerFilterPatch };
