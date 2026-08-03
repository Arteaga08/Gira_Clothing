import { Currency, type TimeseriesPoint, type Wire } from "@gira/shared";

/**
 * "Ingresos" only ever plots the MXN entry — there is no revenue figure that
 * can be drawn without picking a currency (revenue is grouped by currency
 * and never summed, per orderStatsService.ts). MXN is the captured currency;
 * USD is derived (money.ts).
 */
type ChartSeriesKind = "orders" | "revenue" | "units";

interface ChartBar {
  periodStart: string;
  value: number;
  heightPercent: number;
  isZero: boolean;
}

interface ChartSummary {
  total: number;
  max: number;
  average: number;
  zeroDays: number;
}

/** A zero day still draws a bar (hatched, at this floor) instead of a gap that reads as missing data. */
const ZERO_BAR_PERCENT = 6;

const valueFor = (point: Wire<TimeseriesPoint>, kind: ChartSeriesKind): number => {
  if (kind === "orders") return point.orders;
  if (kind === "units") return point.unitsSold;
  return point.revenue.find((entry) => entry.currency === Currency.MXN)?.revenue ?? 0;
};

const toChartBars = (
  series: readonly Wire<TimeseriesPoint>[],
  kind: ChartSeriesKind,
): { bars: ChartBar[]; summary: ChartSummary } => {
  const values = series.map((point) => valueFor(point, kind));
  const max = values.length > 0 ? Math.max(...values) : 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  const zeroDays = values.filter((value) => value === 0).length;

  const bars: ChartBar[] = series.map((point, index) => {
    const value = values[index]!;
    const isZero = value === 0;
    const heightPercent =
      max > 0 ? Math.max(Math.round((value / max) * 100), ZERO_BAR_PERCENT) : ZERO_BAR_PERCENT;
    return { periodStart: point.periodStart, value, heightPercent, isZero };
  });

  const average = series.length > 0 ? Math.round((total / series.length) * 10) / 10 : 0;

  return { bars, summary: { total, max, average, zeroDays } };
};

export { toChartBars, ZERO_BAR_PERCENT };
export type { ChartSeriesKind, ChartBar, ChartSummary };
