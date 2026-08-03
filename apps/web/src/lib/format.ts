import type { Currency, StatsGranularity } from "@gira/shared";

/**
 * Every formatter here pins `locale` and `timeZone` explicitly. A date
 * rendered with the runtime's implicit zone is a server/client hydration
 * mismatch waiting to happen (the exact trap TopBar.tsx documents) — pinning
 * "America/Mexico_City" is what lets this render once, on the server, and
 * agree with the API's own `parseDayRange` zone.
 */
const LOCALE = "es-MX";
const TIMEZONE = "America/Mexico_City";

interface MoneyParts {
  /** Currency symbol/prefix + integer part + grouping, e.g. "$34,175" or "USD 414". */
  amount: string;
  /** Decimal separator + fraction digits, e.g. ".00" — rendered smaller by the caller. */
  fraction: string;
}

/**
 * Money is an integer in minor units everywhere in the API (centavos/cents).
 * Splits the formatted string at the fraction so a KPI can render the cents
 * smaller than the whole amount, as the approved mockup does. Division by
 * 100 happens exactly once, here — never inline in a component.
 */
const formatMoneyParts = (cents: number, currency: Currency): MoneyParts => {
  const parts = new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(cents / 100);

  const amount = parts
    .filter((part) => part.type !== "decimal" && part.type !== "fraction")
    .map((part) => part.value)
    .join("");
  const fractionDigits = parts.find((part) => part.type === "fraction")?.value ?? "00";

  return { amount, fraction: `.${fractionDigits}` };
};

const formatInteger = (value: number): string => new Intl.NumberFormat(LOCALE).format(value);

/** "miércoles, 29 de julio de 2026" — explicit timeZone, never the runtime default. */
const formatLongDate = (instant: Date): string =>
  new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(instant);

/**
 * Day-of-month label for the chart axis, from a "YYYY-MM-DD" key as returned
 * by `TimeseriesPoint.periodStart` under `day` granularity. Parsed as three
 * numbers by hand — `new
 * Date("2026-07-01")` parses as UTC midnight, which reads as June 30th in
 * any zone west of UTC, off by exactly one day.
 */
const formatShortDay = (dayKey: string): string => {
  const [, , day] = dayKey.split("-");
  return String(Number(day));
};

/**
 * `TimeseriesPoint.periodStart` is a "YYYY-MM-DD" key already resolved to the
 * right local calendar bucket by the API (see statsBucketing.ts) — parsed as
 * UTC-anchored components here only to feed `Intl` a `Date` for month-name
 * lookup, never to re-derive the bucket itself. Using `timeZone: "UTC"`
 * keeps that anchor from shifting by a day in either direction.
 */
const parsePeriodStartAsUtcDate = (periodStart: string): Date => {
  const [year, month, day] = periodStart.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
};

const shortWeekFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const shortMonthFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});
const shortYearFormatter = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", year: "numeric" });

/** Chart-axis label for a `TimeseriesPoint.periodStart`, granularity-aware:
 *  day-of-month for `day`, "13 jul" for `week`, "jul 2026" for `month`, plain
 *  year for `year`. A bare day number would repeat "1" on every bar of a
 *  month/year series, which is exactly the bug this function exists to
 *  avoid. */
const formatPeriodLabel = (periodStart: string, granularity: StatsGranularity): string => {
  if (granularity === "day") return formatShortDay(periodStart);
  const instant = parsePeriodStartAsUtcDate(periodStart);
  if (granularity === "week") return shortWeekFormatter.format(instant);
  if (granularity === "month") return shortMonthFormatter.format(instant);
  return shortYearFormatter.format(instant);
};

const morningFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  hour12: false,
});

/** "Buenos días" (<12) · "Buenas tardes" (12–18) · "Buenas noches" (>=19), Mexico City hour. */
const greetingFor = (instant: Date): string => {
  const hour = Number(morningFormatter.format(instant));
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
};

/** "HH:MM", 24h, Mexico City — used for "la más antigua en cola espera desde las HH:MM". */
const formatShortTime = (instant: Date): string =>
  new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);

export {
  formatMoneyParts,
  formatInteger,
  formatLongDate,
  formatShortDay,
  formatPeriodLabel,
  formatShortTime,
  greetingFor,
};
export type { MoneyParts };
