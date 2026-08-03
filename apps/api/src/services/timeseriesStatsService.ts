import { Currency } from "@gira/shared";
import type { TimeseriesStats, TimeseriesPoint, RevenueEntry } from "@gira/shared";
import { Order } from "../models/Order.js";
import { parseDayRange, type DayRangeQuery } from "../utils/parseDayRange.js";
import { bucketExpr, enumerateBucketKeys, parseGranularity } from "../utils/statsBucketing.js";
import { REVENUE_STATUSES } from "./orderStatsService.js";

/**
 * Bucketed series for the Resumen chart — day by default, week/month/year on
 * request. Three separate pipelines, not two: summing $total AFTER $unwind
 * (needed for units) would multiply revenue by the number of lines per
 * order. Revenue runs unwind-free so it reconciles exactly with
 * orderStatsService.period.revenue for the same window.
 *
 * Missing buckets are filled with zeros HERE, never on the client — an empty
 * bucket is `revenue: []`, matching the empty-DB convention the other stats
 * endpoints already use.
 */

interface TimeseriesQuery extends DayRangeQuery {
  granularity?: unknown;
}

interface OrderCountRow {
  _id: string;
  orders: number;
}

interface UnitsRow {
  _id: string;
  unitsSold: number;
}

interface RevenueRow {
  _id: { periodStart: string; currency: Currency };
  revenue: number;
  orders: number;
}

const getTimeseriesStats = async (query: TimeseriesQuery): Promise<TimeseriesStats> => {
  const range = parseDayRange(query);
  const granularity = parseGranularity(query.granularity);
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const groupExpr = bucketExpr(granularity, range.timezone);

  const [orderRows, unitRows, revenueRows] = await Promise.all([
    Order.aggregate<OrderCountRow>([
      { $match: inRange },
      { $group: { _id: groupExpr, orders: { $sum: 1 } } },
    ]),

    Order.aggregate<UnitsRow>([
      { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
      { $unwind: "$lines" },
      { $group: { _id: groupExpr, unitsSold: { $sum: "$lines.qty" } } },
    ]),

    // No $unwind here — summing $total post-unwind would multiply revenue by
    // the line count of each order.
    Order.aggregate<RevenueRow>([
      { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
      {
        $group: {
          _id: { periodStart: groupExpr, currency: "$currency" },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
    ]),
  ]);

  const ordersByBucket = new Map(orderRows.map((r) => [r._id, r.orders]));
  const unitsByBucket = new Map(unitRows.map((r) => [r._id, r.unitsSold]));
  const revenueByBucket = new Map<string, RevenueEntry[]>();
  for (const row of revenueRows) {
    const list = revenueByBucket.get(row._id.periodStart) ?? [];
    list.push({
      currency: row._id.currency,
      revenue: row.revenue,
      orders: row.orders,
      averageTicket: row.orders > 0 ? Math.round(row.revenue / row.orders) : 0,
    });
    revenueByBucket.set(row._id.periodStart, list);
  }

  const bucketKeys = enumerateBucketKeys(range.dayKeys, granularity);
  const series: TimeseriesPoint[] = bucketKeys.map((periodStart) => ({
    periodStart,
    orders: ordersByBucket.get(periodStart) ?? 0,
    unitsSold: unitsByBucket.get(periodStart) ?? 0,
    revenue: revenueByBucket.get(periodStart) ?? [],
  }));

  return {
    range: { from: range.from, to: range.to, days: range.days, timezone: range.timezone },
    granularity,
    series,
  };
};

export { getTimeseriesStats };
