import { Currency } from "@gira/shared";
import type { TimeseriesStats, TimeseriesPoint, RevenueEntry } from "@gira/shared";
import { Order } from "../models/Order.js";
import { parseDayRange, type DayRangeQuery } from "../utils/parseDayRange.js";
import { REVENUE_STATUSES } from "./orderStatsService.js";

/**
 * Daily bucketing for the Resumen chart. Three separate pipelines, not two:
 * summing $total AFTER $unwind (needed for units) would multiply revenue by
 * the number of lines per order. Revenue runs unwind-free so it reconciles
 * exactly with orderStatsService.period.revenue for the same window.
 *
 * Missing days are filled with zeros HERE, never on the client — an empty
 * day is `revenue: []`, matching the empty-DB convention the other stats
 * endpoints already use.
 */

interface OrderCountRow {
  _id: string;
  orders: number;
}

interface UnitsRow {
  _id: string;
  unitsSold: number;
}

interface RevenueRow {
  _id: { day: string; currency: Currency };
  revenue: number;
  orders: number;
}

const getTimeseriesStats = async (query: DayRangeQuery): Promise<TimeseriesStats> => {
  const range = parseDayRange(query);
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const dayExpr = {
    $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: range.timezone },
  };

  const [orderRows, unitRows, revenueRows] = await Promise.all([
    Order.aggregate<OrderCountRow>([
      { $match: inRange },
      { $group: { _id: dayExpr, orders: { $sum: 1 } } },
    ]),

    Order.aggregate<UnitsRow>([
      { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
      { $unwind: "$lines" },
      { $group: { _id: dayExpr, unitsSold: { $sum: "$lines.qty" } } },
    ]),

    // No $unwind here — summing $total post-unwind would multiply revenue by
    // the line count of each order.
    Order.aggregate<RevenueRow>([
      { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
      {
        $group: {
          _id: { day: dayExpr, currency: "$currency" },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
    ]),
  ]);

  const ordersByDay = new Map(orderRows.map((r) => [r._id, r.orders]));
  const unitsByDay = new Map(unitRows.map((r) => [r._id, r.unitsSold]));
  const revenueByDay = new Map<string, RevenueEntry[]>();
  for (const row of revenueRows) {
    const list = revenueByDay.get(row._id.day) ?? [];
    list.push({
      currency: row._id.currency,
      revenue: row.revenue,
      orders: row.orders,
      averageTicket: row.orders > 0 ? Math.round(row.revenue / row.orders) : 0,
    });
    revenueByDay.set(row._id.day, list);
  }

  const series: TimeseriesPoint[] = range.dayKeys.map((day) => ({
    day,
    orders: ordersByDay.get(day) ?? 0,
    unitsSold: unitsByDay.get(day) ?? 0,
    revenue: revenueByDay.get(day) ?? [],
  }));

  return {
    range: { from: range.from, to: range.to, days: range.days, timezone: range.timezone },
    granularity: "day",
    series,
  };
};

export { getTimeseriesStats };
