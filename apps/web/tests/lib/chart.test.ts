import { Currency } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { toChartBars } from "@/lib/stats/chart";

const point = (periodStart: string, orders: number, unitsSold: number, mxnRevenue?: number) => ({
  periodStart,
  orders,
  unitsSold,
  revenue: mxnRevenue === undefined ? [] : [{ currency: Currency.MXN, revenue: mxnRevenue, orders, averageTicket: 0 }],
});

describe("toChartBars — serie orders", () => {
  it("el día del máximo llega a 100%", () => {
    const series = [point("2026-07-01", 2, 0), point("2026-07-02", 5, 0), point("2026-07-03", 1, 0)];
    const { bars } = toChartBars(series, "orders");
    expect(bars[1]!.heightPercent).toBe(100);
  });

  it("serie toda en cero: sin NaN, todas isZero, altura mínima", () => {
    const series = [point("2026-07-01", 0, 0), point("2026-07-02", 0, 0)];
    const { bars, summary } = toChartBars(series, "orders");
    for (const bar of bars) {
      expect(bar.isZero).toBe(true);
      expect(Number.isNaN(bar.heightPercent)).toBe(false);
      expect(bar.heightPercent).toBeGreaterThan(0);
    }
    expect(summary.total).toBe(0);
    expect(summary.max).toBe(0);
  });

  it("bars.length === series.length siempre", () => {
    const series = [point("2026-07-01", 1, 0), point("2026-07-02", 2, 0), point("2026-07-03", 0, 0)];
    expect(toChartBars(series, "orders").bars).toHaveLength(3);
  });

  it("summary.average tiene un decimal", () => {
    const series = [point("2026-07-01", 1, 0), point("2026-07-02", 2, 0), point("2026-07-03", 0, 0)];
    const { summary } = toChartBars(series, "orders");
    expect(summary.average).toBe(1);
  });
});

describe("toChartBars — serie revenue (solo MXN)", () => {
  it("un día con revenue: [] cuenta como cero, no se salta", () => {
    const series = [point("2026-07-01", 1, 0, 10_000), point("2026-07-02", 1, 0)];
    const { bars } = toChartBars(series, "revenue");
    expect(bars).toHaveLength(2);
    expect(bars[1]!.value).toBe(0);
    expect(bars[1]!.isZero).toBe(true);
  });

  it("ignora una entrada de revenue que no sea MXN", () => {
    const series = [
      {
        periodStart: "2026-07-01",
        orders: 1,
        unitsSold: 0,
        revenue: [{ currency: Currency.USD, revenue: 5000, orders: 1, averageTicket: 5000 }],
      },
    ];
    const { bars } = toChartBars(series, "revenue");
    expect(bars[0]!.value).toBe(0);
  });
});

describe("toChartBars — serie units", () => {
  it("usa unitsSold", () => {
    const series = [point("2026-07-01", 1, 4), point("2026-07-02", 1, 8)];
    const { bars } = toChartBars(series, "units");
    expect(bars[1]!.heightPercent).toBe(100);
    expect(bars[1]!.value).toBe(8);
  });
});
