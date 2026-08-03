import type { TopProduct, TopProductsPeriod } from "@gira/shared";
import { Order } from "../models/Order.js";
import { resolveCurrentPeriod, type PeriodQuery } from "../utils/resolveCurrentPeriod.js";
import { REVENUE_STATUSES } from "./orderStatsService.js";

/**
 * "What sold, in this specific calendar period" — a dedicated view, not the
 * `topProducts` slice already bundled into `/admin/orders/stats`/`/overview`
 * (those are scoped to the rolling `?days=` range, a different question).
 * Same aggregation SHAPE as that one (group by SKU, sum qty, sort, limit) —
 * only the window differs.
 */

const TOP_PRODUCTS_LIMIT = 10;

const getTopProductsForPeriod = async (query: PeriodQuery): Promise<TopProductsPeriod> => {
  const range = resolveCurrentPeriod(query);
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };

  const rows = await Order.aggregate<TopProduct & { _id: string }>([
    { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
    { $unwind: "$lines" },
    {
      $group: {
        _id: "$lines.sku",
        productName: { $first: "$lines.productName" },
        printName: { $first: "$lines.printName" },
        units: { $sum: "$lines.qty" },
      },
    },
    { $sort: { units: -1 } },
    { $limit: TOP_PRODUCTS_LIMIT },
  ]);

  return {
    period: range.preset,
    range: { from: range.from, to: range.to },
    products: rows.map((row) => ({
      sku: row._id,
      productName: row.productName,
      printName: row.printName,
      units: row.units,
    })),
  };
};

export { getTopProductsForPeriod, TOP_PRODUCTS_LIMIT };
