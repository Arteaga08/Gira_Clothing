import { ORDER_NUMBER_PATTERN, OrderPriority, OrderStatus } from "@gira/shared";
import { ORDER_TABS, type OrderTabId } from "./status";

const ORDER_SORT_FIELDS = ["createdAt", "total", "status", "priority"] as const;
const DEFAULT_SORT = "-createdAt";
const DEFAULT_TAB: OrderTabId = OrderStatus.PAID;
const DEFAULT_LIMIT = 20;
const MAX_SEARCH_LENGTH = 80;

interface OrderListFilters {
  tab: OrderTabId;
  /** Only meaningful on the "all" tab. */
  status?: OrderStatus;
  priority?: OrderPriority;
  orderNumber?: string;
  search?: string;
  sort: string;
  page: number;
}

/** A change to the filters: optional keys may be `undefined`, which means "clear this filter". */
interface OrderFilterPatch {
  tab?: OrderTabId;
  status?: OrderStatus | undefined;
  priority?: OrderPriority | undefined;
  orderNumber?: string | undefined;
  search?: string | undefined;
  sort?: string;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isTab = (value: string | undefined): value is OrderTabId => ORDER_TABS.some((tab) => tab.id === value);
const isStatus = (value: string | undefined): value is OrderStatus =>
  Object.values(OrderStatus).includes(value as OrderStatus);
const isPriority = (value: string | undefined): value is OrderPriority =>
  Object.values(OrderPriority).includes(value as OrderPriority);

const isAllowedSort = (value: string): boolean =>
  (ORDER_SORT_FIELDS as readonly string[]).includes(value.replace(/^-/, ""));

const parseOrderFilters = (params: RawParams): OrderListFilters => {
  const rawTab = firstOf(params.tab);
  const tab = isTab(rawTab) ? rawTab : DEFAULT_TAB;
  const rawStatus = firstOf(params.status);
  const rawPriority = firstOf(params.prioridad);
  const folio = firstOf(params.folio)?.trim().toUpperCase();
  const search = firstOf(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
  const rawSort = firstOf(params.orden);
  const page = Number(firstOf(params.page));

  const filters: OrderListFilters = {
    tab,
    sort: rawSort && isAllowedSort(rawSort) ? rawSort : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (tab === "all" && isStatus(rawStatus)) filters.status = rawStatus;
  if (isPriority(rawPriority)) filters.priority = rawPriority;
  if (folio && ORDER_NUMBER_PATTERN.test(folio)) filters.orderNumber = folio;
  if (search) filters.search = search;
  return filters;
};

const statusOf = (filters: OrderListFilters): string | undefined =>
  filters.tab === "all" ? filters.status : filters.tab;

/** Query string for GET /admin/orders. Never sends `group`: the tabs are statuses. */
const buildOrderListQuery = (filters: OrderListFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  const status = statusOf(filters);
  if (status) query.set("status", status);
  if (filters.priority) query.set("priority", filters.priority);
  if (filters.orderNumber) query.set("orderNumber", filters.orderNumber);
  if (filters.search) query.set("search", filters.search);
  query.set("sort", filters.sort);
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: OrderListFilters): string => {
  const params = new URLSearchParams();
  if (filters.tab !== DEFAULT_TAB) params.set("tab", filters.tab);
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("prioridad", filters.priority);
  if (filters.orderNumber) params.set("folio", filters.orderNumber);
  if (filters.search) params.set("q", filters.search);
  if (filters.sort !== DEFAULT_SORT) params.set("orden", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
};

/**
 * Applies a patch. Any change other than the page itself goes back to page 1
 * (a new filter makes the old page number meaningless), and changing tab drops
 * the status selector, which only exists on "Todos".
 */
const applyFilterPatch = (current: OrderListFilters, patch: OrderFilterPatch): OrderListFilters => {
  const merged: OrderListFilters = {
    tab: patch.tab ?? current.tab,
    sort: patch.sort ?? current.sort,
    page: patch.page ?? 1,
  };
  const tabChanged = patch.tab !== undefined && patch.tab !== current.tab;
  const pick = <K extends "status" | "priority" | "orderNumber" | "search">(key: K) =>
    key in patch ? patch[key] : current[key];

  const status = tabChanged ? undefined : pick("status");
  const priority = pick("priority");
  const orderNumber = pick("orderNumber");
  const search = pick("search");
  if (status && merged.tab === "all") merged.status = status;
  if (priority) merged.priority = priority;
  if (orderNumber) merged.orderNumber = orderNumber;
  if (search) merged.search = search;
  return merged;
};

export { ORDER_SORT_FIELDS, DEFAULT_SORT, parseOrderFilters, buildOrderListQuery, toSearchParams, applyFilterPatch };
export type { OrderListFilters, OrderFilterPatch };
