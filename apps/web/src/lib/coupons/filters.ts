import { isObjectId } from "@/lib/inventory/variantId";

const COUPON_SORT_FIELDS = ["createdAt", "code", "redeemedCount", "endsAt"] as const;
const DEFAULT_SORT = "-createdAt";
const DEFAULT_LIMIT = 20;
const MAX_SEARCH_LENGTH = 80;
/** The URL key of the open coupon (`?cupon=<id|nuevo>`). */
const COUPON_PARAM = "cupon";

type CouponStatusFilter = "all" | "active" | "scheduled" | "expired" | "exhausted" | "retired";
const DEFAULT_STATUS: CouponStatusFilter = "all";

/** Spanish word used both in the page URL and in the API's `estado` query. */
const STATUS_TO_URL: Readonly<Record<CouponStatusFilter, string>> = {
  all: "todos",
  active: "activos",
  scheduled: "programados",
  expired: "vencidos",
  exhausted: "agotados",
  retired: "retirados",
};
const URL_TO_STATUS: Readonly<Record<string, CouponStatusFilter>> = Object.fromEntries(
  Object.entries(STATUS_TO_URL).map(([status, word]) => [word, status as CouponStatusFilter]),
);

interface CouponFilters {
  status: CouponStatusFilter;
  search?: string;
  sort: string;
  page: number;
}

/** A change to the filters: `search: undefined` means "clear the search". */
interface CouponFilterPatch {
  status?: CouponStatusFilter;
  search?: string | undefined;
  sort?: string;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isAllowedSort = (value: string): boolean =>
  (COUPON_SORT_FIELDS as readonly string[]).includes(value.replace(/^-/, ""));

const parseCouponFilters = (params: RawParams): CouponFilters => {
  const rawSort = firstOf(params.orden);
  const search = firstOf(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number(firstOf(params.page));

  const filters: CouponFilters = {
    status: URL_TO_STATUS[firstOf(params.estado) ?? ""] ?? DEFAULT_STATUS,
    sort: rawSort && isAllowedSort(rawSort) ? rawSort : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (search) filters.search = search;
  return filters;
};

/** The coupon the modal shows: `"nuevo"` for the create form, a valid id for an existing one. */
const parseSelectedCoupon = (params: RawParams): string | undefined => {
  const raw = firstOf(params[COUPON_PARAM]);
  if (raw === "nuevo") return raw;
  return raw && isObjectId(raw) ? raw : undefined;
};

/** Query string for GET /admin/coupons. */
const buildCouponListQuery = (filters: CouponFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  if (filters.status !== DEFAULT_STATUS) query.set("estado", STATUS_TO_URL[filters.status]);
  if (filters.search) query.set("search", filters.search);
  query.set("sort", filters.sort);
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: CouponFilters, selected?: string): string => {
  const params = new URLSearchParams();
  if (filters.status !== DEFAULT_STATUS) params.set("estado", STATUS_TO_URL[filters.status]);
  if (filters.search) params.set("q", filters.search);
  if (filters.sort !== DEFAULT_SORT) params.set("orden", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (selected) params.set(COUPON_PARAM, selected);
  return params.toString();
};

/** Any change other than the page itself goes back to page 1: a new filter makes the old page meaningless. */
const applyFilterPatch = (current: CouponFilters, patch: CouponFilterPatch): CouponFilters => {
  const merged: CouponFilters = {
    status: patch.status ?? current.status,
    sort: patch.sort ?? current.sort,
    page: patch.page ?? 1,
  };
  const search = "search" in patch ? patch.search : current.search;
  if (search) merged.search = search;
  return merged;
};

/** True when something other than sort/page narrows the list: the empty state's wording depends on it. */
const hasActiveFilters = (filters: CouponFilters): boolean =>
  Boolean(filters.search) || filters.status !== DEFAULT_STATUS;

export {
  COUPON_SORT_FIELDS,
  COUPON_PARAM,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  DEFAULT_STATUS,
  parseCouponFilters,
  parseSelectedCoupon,
  buildCouponListQuery,
  toSearchParams,
  applyFilterPatch,
  hasActiveFilters,
};
export type { CouponFilters, CouponFilterPatch, CouponStatusFilter };
