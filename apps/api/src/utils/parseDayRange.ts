import { MAX_DAYS } from "./parseStatsRange.js";

/**
 * Calendar-day bucketing for the timeseries endpoint — deliberately separate
 * from parseStatsRange, whose rolling `now - days*24h` window leaves the
 * first and last bucket partial (a false dip on both ends of a chart). This
 * anchors `from` to LOCAL midnight of `today - (days - 1)`.
 *
 * The local day is derived via Intl, never a hardcoded UTC offset — Mexico
 * dropped DST in 2022, but this helper must not encode that as a fact.
 */

const TIMEZONE = "America/Mexico_City";
const DEFAULT_DAYS = 30;

interface DayRangeQuery {
  days?: unknown;
}

interface DayRange {
  from: Date;
  to: Date;
  days: number;
  timezone: string;
  /** "YYYY-MM-DD" local calendar days, ascending, length === days. */
  dayKeys: string[];
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE });

/** "YYYY-MM-DD" for the local calendar day a UTC instant falls on. */
const localDayKey = (instant: Date): string => dayFormatter.format(instant);

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** UTC instant for LOCAL midnight of the given "YYYY-MM-DD" day key. */
const localMidnightUtc = (dayKey: string): Date => {
  // A naive Date.parse of "YYYY-MM-DDT00:00:00" assumes the runtime's local
  // zone, not Mexico's. Instead: take an arbitrary UTC anchor built from the
  // same Y-M-D numbers, read how that instant looks when formatted in
  // Mexico's zone, and use the gap between the two readings as the offset —
  // measured, never assumed, so this keeps working if Mexico's DST policy
  // ever changes again.
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const anchor = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  const parts = offsetFormatter.formatToParts(anchor);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // formatToParts with hour12:false can render midnight as "24" — normalize.
  const localReadingAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));

  const offsetMs = anchor.getTime() - localReadingAsUtc;
  return new Date(anchor.getTime() + offsetMs);
};

const parseDayRange = (query: DayRangeQuery): DayRange => {
  const raw = Number(query.days);
  const days = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.trunc(raw), MAX_DAYS) : DEFAULT_DAYS;

  const to = new Date();
  const todayKey = localDayKey(to);
  const todayMidnight = localMidnightUtc(todayKey);

  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const instant = new Date(todayMidnight.getTime() - i * 24 * 60 * 60 * 1000);
    dayKeys.push(localDayKey(instant));
  }

  const from = localMidnightUtc(dayKeys[0]!);
  return { from, to, days, timezone: TIMEZONE, dayKeys };
};

export type { DayRange, DayRangeQuery };
export { parseDayRange, localDayKey, localMidnightUtc, TIMEZONE, DEFAULT_DAYS, MAX_DAYS };
