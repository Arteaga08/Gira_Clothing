import { Currency, OrderStatus } from "@gira/shared";
import { Order } from "../models/Order.js";
import { parseStatsRange, type StatsRangeQuery } from "../utils/parseStatsRange.js";

/**
 * Operational KPIs for the orders module.
 *
 * Two questions, answered separately on purpose:
 *  - "How did the period go?" -> everything under `period`, bounded by the range.
 *  - "What needs attention NOW?" -> `alerts`, deliberately IGNORING the range.
 *    An order stuck in `processing` for a week is not less stuck because the
 *    admin is looking at yesterday's numbers.
 *
 * Revenue is grouped BY CURRENCY and never summed across them: MXN + USD is a
 * number that means nothing.
 */

const DEFAULT_DAYS = 30;
const TOP_PRODUCTS = 5;
const TOP_PRINTS = 5;
const AWAITING_PREPARATION_HOURS = 24;
const STUCK_PROCESSING_HOURS = 72;
const IN_TRANSIT_DAYS = 14;

/** Statuses where the money is genuinely ours. */
const REVENUE_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

interface RevenueEntry {
  currency: Currency;
  revenue: number;
  orders: number;
  averageTicket: number;
}

interface TopProduct {
  sku: string;
  productName: string;
  printName: string;
  units: number;
}

/**
 * Grouped by print, not by SKU: a print can be sold on several products
 * (a hoodie and a tee, several sizes), so no single sku/productName applies.
 * `topProducts` above cannot answer "which print sells the most" — it's
 * capped at the top 5 SKUs, and the same print split across two SKUs would
 * undercount there.
 */
interface TopPrint {
  printName: string;
  units: number;
}

interface OrderStats {
  range: { from: Date; to: Date; days: number };
  period: {
    totalOrders: number;
    paidOrders: number;
    revenue: RevenueEntry[];
    /**
     * Sum of every order's `total` converted to MXN using ITS OWN frozen
     * `exchangeRate` (never today's Settings rate), MXN orders passed through
     * unchanged. A dashboard-only convenience figure — `revenue` above stays
     * the untouched, per-currency source of truth.
     */
    totalMxnEquivalent: number;
    unitsSold: number;
    topProducts: TopProduct[];
    topPrints: TopPrint[];
  };
  byStatus: Record<string, number>;
  alerts: {
    awaitingPreparation: number;
    stuckInProcessing: number;
    inTransitTooLong: number;
    disputed: number;
    pendingPayment: number;
  };
}

const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 60 * 60 * 1000);

const getOrderStats = async (query: StatsRangeQuery): Promise<OrderStats> => {
  const range = parseStatsRange(query, DEFAULT_DAYS);
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };

  const [
    totalOrders,
    revenueRows,
    mxnEquivalentRows,
    statusRows,
    unitRows,
    topRows,
    printRows,
    alerts,
  ] = await Promise.all([
      Order.countDocuments(inRange),

      Order.aggregate<{ _id: Currency; revenue: number; orders: number }>([
        { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
        { $group: { _id: "$currency", revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
      ]),

      // Per-document conversion BEFORE grouping: exchangeRate varies order to
      // order (frozen at each checkout), so multiplying-then-summing is the
      // only correct order of operations — summing totals and rates
      // separately and multiplying afterward would be a weighted-average
      // error, not a linear one. MXN orders pass through untouched: their
      // stored exchangeRate is whatever Settings.currency.mxnPerUsdCents
      // happened to be at checkout (never 1), an unused passenger value for
      // that currency.
      Order.aggregate<{ _id: null; totalMxnEquivalent: number }>([
        { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
        {
          $addFields: {
            mxnEquivalent: {
              $cond: {
                if: { $eq: ["$currency", Currency.MXN] },
                then: "$total",
                else: {
                  $round: [{ $divide: [{ $multiply: ["$total", "$exchangeRate"] }, 100] }, 0],
                },
              },
            },
          },
        },
        { $group: { _id: null, totalMxnEquivalent: { $sum: "$mxnEquivalent" } } },
      ]),

      Order.aggregate<{ _id: OrderStatus; count: number }>([
        { $match: inRange },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      // Total units for the WHOLE period — computed on its own, never derived
      // from the top-5 slice below (that would silently under-report).
      Order.aggregate<{ _id: null; units: number }>([
        { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
        { $unwind: "$lines" },
        { $group: { _id: null, units: { $sum: "$lines.qty" } } },
      ]),

      Order.aggregate<TopProduct & { _id: string }>([
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
        { $limit: TOP_PRODUCTS },
      ]),

      Order.aggregate<TopPrint & { _id: string }>([
        { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
        { $unwind: "$lines" },
        { $group: { _id: "$lines.printName", units: { $sum: "$lines.qty" } } },
        { $sort: { units: -1 } },
        { $limit: TOP_PRINTS },
      ]),

      // Range-independent by design — see the header comment.
      Promise.all([
        Order.countDocuments({
          status: OrderStatus.PAID,
          paidAt: { $lt: hoursAgo(AWAITING_PREPARATION_HOURS) },
        }),
        Order.countDocuments({
          status: OrderStatus.PROCESSING,
          updatedAt: { $lt: hoursAgo(STUCK_PROCESSING_HOURS) },
        }),
        Order.countDocuments({
          status: OrderStatus.SHIPPED,
          updatedAt: { $lt: hoursAgo(IN_TRANSIT_DAYS * 24) },
        }),
        Order.countDocuments({ status: OrderStatus.DISPUTED }),
        Order.countDocuments({ status: OrderStatus.PENDING_PAYMENT }),
      ]),
    ]);

  const revenue: RevenueEntry[] = revenueRows.map((row) => ({
    currency: row._id,
    revenue: row.revenue,
    orders: row.orders,
    // Integer division: an average ticket of "1499.5 centavos" is not a thing.
    averageTicket: row.orders > 0 ? Math.round(row.revenue / row.orders) : 0,
  }));

  const [awaitingPreparation, stuckInProcessing, inTransitTooLong, disputed, pendingPayment] =
    alerts;

  return {
    range,
    period: {
      totalOrders,
      paidOrders: revenue.reduce((sum, entry) => sum + entry.orders, 0),
      revenue,
      totalMxnEquivalent: mxnEquivalentRows[0]?.totalMxnEquivalent ?? 0,
      unitsSold: unitRows[0]?.units ?? 0,
      topProducts: topRows.map((row) => ({
        sku: row._id,
        productName: row.productName,
        printName: row.printName,
        units: row.units,
      })),
      topPrints: printRows.map((row) => ({ printName: row._id, units: row.units })),
    },
    byStatus: Object.fromEntries(statusRows.map((row) => [row._id, row.count])),
    alerts: { awaitingPreparation, stuckInProcessing, inTransitTooLong, disputed, pendingPayment },
  };
};

export type { OrderStats, RevenueEntry, TopProduct, TopPrint };
export { getOrderStats, DEFAULT_DAYS, REVENUE_STATUSES };
