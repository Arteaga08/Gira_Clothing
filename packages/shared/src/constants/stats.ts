/**
 * Cross-cutting business rules for the stats endpoints, not an API-internal
 * detail: both `apps/api` (validator + range parsing) and `apps/web` (chart
 * bucketing/labels) need the same values, so they live here instead of being
 * duplicated as separate literals on each side.
 */

const STATS_GRANULARITIES = ["day", "week", "month", "year"] as const;

type StatsGranularity = (typeof STATS_GRANULARITIES)[number];

/**
 * 2 years of daily aggregation. `year` granularity is meaningless under the
 * old 365-day cap (a single partial bucket); 730 gives two full calendar
 * years without opening the door to an unbounded live scan over `createdAt`
 * — there are no precomputed rollups, every request re-aggregates.
 */
const MAX_STATS_DAYS = 730;

export type { StatsGranularity };
export { STATS_GRANULARITIES, MAX_STATS_DAYS };
