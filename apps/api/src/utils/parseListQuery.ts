import type { ApiMeta } from "@gira/shared";

/**
 * Transversal list parser (BACKEND_ARCHITECTURE_GUIDELINES, "Listados
 * administrativos"). Every admin/public listing goes through this: paginate,
 * sort, search, filter — never a raw client object handed to Mongo.
 *
 * The caller builds `filters` EXPLICITLY from already-validated query params.
 * Nothing from `query` reaches the Mongo filter except the escaped search term.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 80;

interface ListQueryConfig {
  /** Whitelisted sortable fields. Anything else falls back to `defaultSort`. */
  sortable: readonly string[];
  /** Whitelisted fields the free-text search runs against. */
  searchable: readonly string[];
  /** e.g. "name" or "-createdAt". Its field must be in `sortable`. */
  defaultSort: string;
  defaultLimit?: number;
  maxLimit?: number;
}

interface RawListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
}

interface ParsedListQuery {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
  filter: Record<string, unknown>;
}

/** Escapes every regex metacharacter (anti-ReDoS / anti-injection, SECURITY §4). */
const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toPositiveInt = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : fallback;
};

const parseSort = (raw: unknown, config: ListQueryConfig): Record<string, 1 | -1> => {
  const candidate = typeof raw === "string" && raw.trim() ? raw.trim() : config.defaultSort;
  const desc = candidate.startsWith("-");
  const field = desc ? candidate.slice(1) : candidate;
  const allowed = config.sortable.includes(field);
  const safeField = allowed ? field : config.defaultSort.replace(/^-/, "");
  const safeDesc = allowed ? desc : config.defaultSort.startsWith("-");
  // `_id` tiebreaker keeps pagination deterministic when the sort key repeats.
  return { [safeField]: safeDesc ? -1 : 1, _id: safeDesc ? -1 : 1 };
};

const parseListQuery = (
  query: RawListQuery,
  config: ListQueryConfig,
  filters: Record<string, unknown> = {},
): ParsedListQuery => {
  const maxLimit = config.maxLimit ?? MAX_LIMIT;
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, config.defaultLimit ?? DEFAULT_LIMIT), maxLimit);

  const filter: Record<string, unknown> = { ...filters };

  const term =
    typeof query.search === "string" ? query.search.trim().slice(0, MAX_SEARCH_LENGTH) : "";
  if (term && config.searchable.length > 0) {
    const rx = new RegExp(escapeRegex(term), "i");
    filter.$or = config.searchable.map((field) => ({ [field]: rx }));
  }

  return { page, limit, skip: (page - 1) * limit, sort: parseSort(query.sort, config), filter };
};

const buildMeta = (total: number, { page, limit }: { page: number; limit: number }): ApiMeta => ({
  total,
  page,
  limit,
  pages: total === 0 ? 0 : Math.ceil(total / limit),
});

export type { ListQueryConfig, ParsedListQuery, RawListQuery };
export { parseListQuery, buildMeta, escapeRegex };
