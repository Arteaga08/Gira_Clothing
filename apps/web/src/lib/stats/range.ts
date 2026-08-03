import { STATS_GRANULARITIES, type StatsGranularity } from "@gira/shared";

/**
 * The API accepts any `days` from 1 to 730 (statsValidator.ts), but the
 * screen only offers a few per granularity. Accepting an arbitrary value
 * would leave the segmented control with no active option — a state nobody
 * designed and no test covers — so anything outside the whitelist falls back
 * to that granularity's default silently. This is state closure, not
 * security validation: the guard and the API already own that.
 */
const RANGE_OPTIONS = [7, 30, 90] as const;
const DEFAULT_RANGE_DAYS: RangeDays = 30;

type RangeDays = number;

/**
 * Every granularity earns its own range options — day bars stop being
 * legible past ~90 of them, while a year of weekly bars is still only ~52
 * bars. `year` offers a single option: the API's own cap, since anything
 * shorter can't produce more than one or two yearly buckets anyway.
 */
const RANGE_OPTIONS_BY_GRANULARITY: Record<StatsGranularity, readonly RangeDays[]> = {
  day: RANGE_OPTIONS,
  week: [90, 180, 365],
  month: [180, 365, 730],
  year: [730],
};

const DEFAULT_RANGE_BY_GRANULARITY: Record<StatsGranularity, RangeDays> = {
  day: DEFAULT_RANGE_DAYS,
  week: 90,
  month: 365,
  year: 730,
};

const rangeOptionsFor = (granularity: StatsGranularity): readonly RangeDays[] =>
  RANGE_OPTIONS_BY_GRANULARITY[granularity];

/**
 * `searchParams` values from Next are `string | string[] | undefined` — an
 * array shows up when the query param repeats (`?dias=7&dias=90`), which is
 * ambiguous input, not "take the first match". `granularity` picks which
 * whitelist applies; it defaults to `day`, so existing single-argument
 * callers keep the original `[7, 30, 90]` behavior unchanged.
 */
const parseRangeDays = (
  raw: string | readonly string[] | undefined,
  granularity: StatsGranularity = "day",
): RangeDays => {
  const options = rangeOptionsFor(granularity);
  const fallback = DEFAULT_RANGE_BY_GRANULARITY[granularity];
  if (typeof raw !== "string") return fallback;
  const parsed = Number(raw);
  const match = options.find((option) => option === parsed);
  return match ?? fallback;
};

/** Same closure rule as `parseRangeDays`, over the four buckets the API's
 *  `statsBucketing.ts` actually knows how to build. */
const parseGranularity = (raw: string | readonly string[] | undefined): StatsGranularity => {
  if (typeof raw !== "string") return "day";
  const match = (STATS_GRANULARITIES as readonly string[]).find((option) => option === raw);
  return (match as StatsGranularity | undefined) ?? "day";
};

export {
  RANGE_OPTIONS,
  RANGE_OPTIONS_BY_GRANULARITY,
  DEFAULT_RANGE_DAYS,
  DEFAULT_RANGE_BY_GRANULARITY,
  parseRangeDays,
  parseGranularity,
  rangeOptionsFor,
};
export type { RangeDays };
