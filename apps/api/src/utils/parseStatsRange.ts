import { MAX_STATS_DAYS } from "@gira/shared";

/**
 * Resolves a stats window ONCE per request so every aggregation in the same
 * endpoint shares identical bounds (BACKEND_ARCHITECTURE_GUIDELINES, "Endpoints
 * de estadísticas/KPIs"). Two aggregations computing `new Date()` separately
 * produce a panel whose numbers do not add up.
 *
 * The default is a PARAMETER, not a constant: each module picks its own
 * (orders: 30 days, inventory: not time-based at all).
 */

/** Re-exported so callers (this file, parseDayRange.ts, statsValidator.ts)
 *  share the one number instead of duplicating the literal. */
const MAX_DAYS = MAX_STATS_DAYS;

interface StatsRangeQuery {
  days?: unknown;
}

interface StatsRange {
  from: Date;
  to: Date;
  days: number;
}

const parseStatsRange = (query: StatsRangeQuery, defaultDays: number): StatsRange => {
  const raw = Number(query.days);
  const days =
    Number.isFinite(raw) && raw >= 1 ? Math.min(Math.trunc(raw), MAX_DAYS) : defaultDays;

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, days };
};

export type { StatsRange, StatsRangeQuery };
export { parseStatsRange, MAX_DAYS };
