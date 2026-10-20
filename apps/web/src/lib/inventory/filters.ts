import type { StockStatus } from "@gira/shared";
import { isObjectId } from "./variantId";

const INVENTORY_SORT_FIELDS = ["sku", "available", "updatedAt"] as const;
const DEFAULT_SORT = "available";
const DEFAULT_LIMIT = 100;
const MAX_SEARCH_LENGTH = 80;

/** URL value (Spanish) -> API value. Absent means "Todos". */
const STOCK_URL_VALUES: Readonly<Record<string, StockStatus>> = { agotado: "out", bajo: "low", ok: "ok" };
const STOCK_TO_URL: Readonly<Record<StockStatus, string>> = { out: "agotado", low: "bajo", ok: "ok" };

interface InventoryFilters {
  stock?: StockStatus;
  category?: string;
  product?: string;
  print?: string;
  search?: string;
  sort: string;
  page: number;
}

/** A change to the filters: optional keys may be `undefined`, which means "clear this filter". */
interface InventoryFilterPatch {
  stock?: StockStatus | undefined;
  category?: string | undefined;
  product?: string | undefined;
  print?: string | undefined;
  search?: string | undefined;
  sort?: string;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isAllowedSort = (value: string): boolean =>
  (INVENTORY_SORT_FIELDS as readonly string[]).includes(value.replace(/^-/, ""));

const idOf = (value: string | undefined): string | undefined => (value && isObjectId(value) ? value : undefined);

const parseInventoryFilters = (params: RawParams): InventoryFilters => {
  const stock = STOCK_URL_VALUES[firstOf(params.estado) ?? ""];
  const search = firstOf(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
  const rawSort = firstOf(params.orden);
  const page = Number(firstOf(params.page));
  const category = idOf(firstOf(params.categoria));
  const product = idOf(firstOf(params.modelo));
  const print = idOf(firstOf(params.print));

  const filters: InventoryFilters = {
    sort: rawSort && isAllowedSort(rawSort) ? rawSort : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (stock) filters.stock = stock;
  if (category) filters.category = category;
  if (product) filters.product = product;
  if (print) filters.print = print;
  if (search) filters.search = search;
  return filters;
};

/** Query string for GET /admin/variants. The panel only ever lists active variants, so the tab counts match. */
const buildVariantListQuery = (filters: InventoryFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  query.set("isActive", "true");
  if (filters.stock) query.set("stock", filters.stock);
  if (filters.category) query.set("category", filters.category);
  if (filters.product) query.set("product", filters.product);
  if (filters.print) query.set("print", filters.print);
  if (filters.search) query.set("search", filters.search);
  query.set("sort", filters.sort);
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: InventoryFilters): string => {
  const params = new URLSearchParams();
  if (filters.stock) params.set("estado", STOCK_TO_URL[filters.stock]);
  if (filters.category) params.set("categoria", filters.category);
  if (filters.product) params.set("modelo", filters.product);
  if (filters.print) params.set("print", filters.print);
  if (filters.search) params.set("q", filters.search);
  if (filters.sort !== DEFAULT_SORT) params.set("orden", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
};

/** Applies a patch. Any change other than the page itself goes back to page 1: a new filter makes the old page meaningless. */
const applyFilterPatch = (current: InventoryFilters, patch: InventoryFilterPatch): InventoryFilters => {
  const merged: InventoryFilters = { sort: patch.sort ?? current.sort, page: patch.page ?? 1 };
  const pick = <K extends "stock" | "category" | "product" | "print" | "search">(key: K) =>
    key in patch ? patch[key] : current[key];

  const stock = pick("stock");
  const category = pick("category");
  const product = pick("product");
  const print = pick("print");
  const search = pick("search");
  if (stock) merged.stock = stock;
  if (category) merged.category = category;
  if (product) merged.product = product;
  if (print) merged.print = print;
  if (search) merged.search = search;
  return merged;
};

/** True when something other than sort/page narrows the list: the empty state and the auto-open depend on it. */
const hasActiveFilters = (filters: InventoryFilters): boolean =>
  Boolean(filters.stock ?? filters.category ?? filters.product ?? filters.print ?? filters.search);

export {
  INVENTORY_SORT_FIELDS,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  parseInventoryFilters,
  buildVariantListQuery,
  toSearchParams,
  applyFilterPatch,
  hasActiveFilters,
};
export type { InventoryFilters, InventoryFilterPatch };
