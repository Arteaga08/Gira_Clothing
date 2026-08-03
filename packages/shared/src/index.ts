import type { ApiStatus, ApiMeta, ApiResponse } from "./types/apiResponse.js";
import { UserRole } from "./enums/userRole.js";
import { AuditModule, AuditAction } from "./enums/auditAction.js";
import { OrderStatus, PaymentStatus, ReservationStatus } from "./enums/orderStatus.js";
import { Currency, PriceRounding } from "./enums/money.js";
import { ShipmentStatus } from "./enums/shipment.js";
import {
  NotificationChannelKind,
  NotificationType,
  NotificationStatus,
} from "./enums/notification.js";

export type { ApiStatus, ApiMeta, ApiResponse };
export {
  UserRole,
  AuditModule,
  AuditAction,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
  Currency,
  PriceRounding,
  ShipmentStatus,
  NotificationChannelKind,
  NotificationType,
  NotificationStatus,
};

// ── M5: dashboard DTOs + shared labels (Wire<T>-mapped by the HTTP client) ──
import type { Wire } from "./types/wire.js";
import type {
  OrderCustomer,
  ShippingAddress,
  ImageAttrs,
  OrderLine,
  PublicOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
} from "./types/order.js";
import type {
  PrintFamily,
  ProductCategory,
  Print,
  Measurements,
  Product,
  Variant,
} from "./types/catalog.js";
import type { PublicUser, AdminUser } from "./types/user.js";
import type {
  ShipmentEvent,
  PublicTracking,
  AdminShipment,
  AdminShipmentListItem,
} from "./types/shipment.js";
import type {
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  Settings,
} from "./types/settings.js";
import type {
  RevenueEntry,
  TopProduct,
  TopPrint,
  TopProductsPeriod,
  OrderStatsAlerts,
  OrderStats,
  LowStockItem,
  InventoryStats,
  Overview,
  TimeseriesPoint,
  TimeseriesStats,
  FailedNotificationSample,
  OutboxHealth,
} from "./types/stats.js";
import type { PeriodPreset, StatsGranularity } from "./constants/stats.js";
import { PERIOD_PRESETS, STATS_GRANULARITIES, MAX_STATS_DAYS } from "./constants/stats.js";
import type { AuditLogEntry } from "./types/audit.js";
import type { LoginRequest, LoginResponse, MeResponse, ApiErrorBody } from "./types/auth.js";
import { ORDER_STATUS_LABELS } from "./labels/orderStatus.js";
import { SHIPMENT_STATUS_LABELS } from "./labels/shipmentStatus.js";
import {
  TWO_FACTOR_REQUIRED_MESSAGE,
  TWO_FACTOR_INVALID_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
} from "./labels/authMessages.js";

export type {
  Wire,
  OrderCustomer,
  ShippingAddress,
  ImageAttrs,
  OrderLine,
  PublicOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
  PrintFamily,
  ProductCategory,
  Print,
  Measurements,
  Product,
  Variant,
  PublicUser,
  AdminUser,
  ShipmentEvent,
  PublicTracking,
  AdminShipment,
  AdminShipmentListItem,
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  Settings,
  RevenueEntry,
  TopProduct,
  TopPrint,
  TopProductsPeriod,
  OrderStatsAlerts,
  OrderStats,
  LowStockItem,
  InventoryStats,
  Overview,
  TimeseriesPoint,
  TimeseriesStats,
  FailedNotificationSample,
  OutboxHealth,
  AuditLogEntry,
};
export type { StatsGranularity, PeriodPreset };
export { STATS_GRANULARITIES, MAX_STATS_DAYS, PERIOD_PRESETS };
export type { LoginRequest, LoginResponse, MeResponse, ApiErrorBody };
export { ORDER_STATUS_LABELS, SHIPMENT_STATUS_LABELS };
export { TWO_FACTOR_REQUIRED_MESSAGE, TWO_FACTOR_INVALID_MESSAGE, INVALID_CREDENTIALS_MESSAGE };
