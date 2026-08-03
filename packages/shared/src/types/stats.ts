import type { Currency } from "../enums/money.js";
import type { OrderStatus } from "../enums/orderStatus.js";
import type { NotificationChannelKind, NotificationType } from "../enums/notification.js";
import type { StatsGranularity } from "../constants/stats.js";

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

/** Grouped by print, not by SKU — a print can span several products. */
interface TopPrint {
  printName: string;
  units: number;
}

interface OrderStatsAlerts {
  awaitingPreparation: number;
  stuckInProcessing: number;
  inTransitTooLong: number;
  disputed: number;
  pendingPayment: number;
}

interface OrderStats {
  range: { from: Date; to: Date; days: number };
  period: {
    totalOrders: number;
    paidOrders: number;
    revenue: RevenueEntry[];
    /**
     * Sum of every order's `total` converted to MXN using ITS OWN frozen
     * `exchangeRate`, MXN orders passed through unchanged. A dashboard-only
     * computed figure — `revenue` above stays the untouched, per-currency
     * source of truth.
     */
    totalMxnEquivalent: number;
    unitsSold: number;
    topProducts: TopProduct[];
    topPrints: TopPrint[];
  };
  byStatus: Partial<Record<OrderStatus, number>>;
  alerts: OrderStatsAlerts;
}

interface LowStockItem {
  id: string;
  sku: string;
  available: number;
}

interface InventoryStats {
  lowStockThreshold: number;
  activeVariants: number;
  outOfStock: number;
  lowStock: number;
  unitsOnHand: number;
  unitsReserved: number;
  unitsAvailable: number;
  lowStockItems: LowStockItem[];
}

interface Overview {
  orders: OrderStats;
  inventory: InventoryStats;
}

interface TimeseriesPoint {
  /**
   * "YYYY-MM-DD" — local calendar start of the bucket: the day itself for
   * `day`, the ISO-week Monday for `week`, the 1st for `month`/`year`. NOT
   * clamped to `range.from` — a monthly bucket can legitimately start before
   * the requested window; `orders`/`unitsSold`/`revenue` are still correctly
   * scoped to the window because the query's $match runs before grouping.
   */
  periodStart: string;
  orders: number;
  unitsSold: number;
  revenue: RevenueEntry[];
}

interface TimeseriesStats {
  range: { from: Date; to: Date; days: number; timezone: string };
  granularity: StatsGranularity;
  series: TimeseriesPoint[];
}

interface FailedNotificationSample {
  id: string;
  channel: NotificationChannelKind;
  type: NotificationType;
  attempts: number;
  lastError?: string;
  updatedAt: Date;
}

interface OutboxHealth {
  pending: number;
  sending: number;
  failed: number;
  sent: number;
  stale: number;
  oldestPendingAt: Date | null;
  failedSample: FailedNotificationSample[];
}

export type {
  RevenueEntry,
  TopProduct,
  TopPrint,
  OrderStatsAlerts,
  OrderStats,
  LowStockItem,
  InventoryStats,
  Overview,
  TimeseriesPoint,
  TimeseriesStats,
  FailedNotificationSample,
  OutboxHealth,
};
