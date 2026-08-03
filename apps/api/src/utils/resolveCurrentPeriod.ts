import { PERIOD_PRESETS, type PeriodPreset } from "@gira/shared";
import { localDayKey, localMidnightUtc } from "./parseDayRange.js";
import { bucketKeyFor, pad2 } from "./statsBucketing.js";

/**
 * Calendar-anchored "current period" windows for the top-products-by-period
 * widget — deliberately NOT a rolling N-day window like `parseStatsRange`/
 * `parseDayRange`. "This week" means Monday-of-this-ISO-week through now,
 * not "the last 7 days"; mixing the two concepts into one time selector is
 * exactly how "the number doesn't match what the control says" bugs start.
 *
 * `today`/`week`/`month` anchor to their start and run to THIS INSTANT.
 * `custom` is the one exception: a full calendar day (local midnight to the
 * next local midnight), regardless of when it's queried — a past or future
 * date is never clamped to "now".
 */

interface PeriodQuery {
  period?: unknown;
  fecha?: unknown;
}

interface PeriodRange {
  preset: PeriodPreset;
  from: Date;
  to: Date;
}

/** Defensive re-validation at the service layer — Joi already whitelists
 *  `period` at the route, mirroring `parseGranularity`'s own style. */
const parsePeriodPreset = (raw: unknown): PeriodPreset =>
  typeof raw === "string" && (PERIOD_PRESETS as readonly string[]).includes(raw)
    ? (raw as PeriodPreset)
    : "today";

/** The next calendar day's key, via plain Y/M/D component arithmetic —
 *  mirrors `mondayOf`'s own UTC-anchored style in statsBucketing.ts. */
const nextDayKey = (dayKey: string): string => {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const anchor = new Date(Date.UTC(year, month - 1, day + 1));
  return `${anchor.getUTCFullYear()}-${pad2(anchor.getUTCMonth() + 1)}-${pad2(anchor.getUTCDate())}`;
};

const resolveCurrentPeriod = (query: PeriodQuery): PeriodRange => {
  const preset = parsePeriodPreset(query.period);
  const now = new Date();
  const todayKey = localDayKey(now);

  if (preset === "custom") {
    const fecha = typeof query.fecha === "string" ? query.fecha : todayKey;
    return { preset, from: localMidnightUtc(fecha), to: localMidnightUtc(nextDayKey(fecha)) };
  }

  // "today"/"week"/"month" all resolve to the START of their bucket via the
  // exact same bucketing rules the timeseries chart uses — reused, not
  // reimplemented, so "the 1st of the month" only has one definition.
  const anchorKey = preset === "today" ? todayKey : bucketKeyFor(todayKey, preset);
  return { preset, from: localMidnightUtc(anchorKey), to: now };
};

export type { PeriodPreset, PeriodQuery, PeriodRange };
export { resolveCurrentPeriod, PERIOD_PRESETS };
