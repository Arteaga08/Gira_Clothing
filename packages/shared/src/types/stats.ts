import type { Currency } from "../enums/money.js";
import type { OrderStatus } from "../enums/orderStatus.js";
import type { NotificationChannelKind, NotificationType } from "../enums/notification.js";

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
    unitsSold: number;
    topProducts: TopProduct[];
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
  /** "YYYY-MM-DD", local calendar day. */
  day: string;
  orders: number;
  unitsSold: number;
  revenue: RevenueEntry[];
}

interface TimeseriesStats {
  range: { from: Date; to: Date; days: number; timezone: string };
  granularity: "day";
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
