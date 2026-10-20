import type { ApiStatus, ApiMeta, ApiResponse } from "./types/apiResponse.js";
import { UserRole } from "./enums/userRole.js";
import { AuditModule, AuditAction } from "./enums/auditAction.js";
import {
  OrderStatus,
  PaymentStatus,
  DisputeStatus,
  ReservationStatus,
} from "./enums/orderStatus.js";
import { OrderPriority } from "./enums/orderPriority.js";
import { Currency, PriceRounding } from "./enums/money.js";
import {
  ShippingProviderName,
  ShippingCarrier,
  ShippingLabelStatus,
  ShipmentTrackingStatus,
} from "./enums/shipping.js";
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
  DisputeStatus,
  ReservationStatus,
  OrderPriority,
  Currency,
  PriceRounding,
  ShippingProviderName,
  ShippingCarrier,
  ShippingLabelStatus,
  ShipmentTrackingStatus,
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
  CustomerOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
  OrderSummary,
  OrderActivityEntry,
  BulkStatusOutcome,
  BulkStatusResult,
} from "./types/order.js";
import type {
  PrintFamily,
  ProductCategory,
  Print,
  Measurements,
  Product,
  Variant,
  PublicVariant,
} from "./types/catalog.js";
import type { PublicUser, AdminUser } from "./types/user.js";
import type {
  ShippingOrigin,
  ShippingParcel,
  ShippingParcelSettings,
  ShippingRate,
  ShippingQuoteResponse,
  OrderShippingSelection,
  PublicShippingSelection,
  OrderLabelAdmin,
  OrderTrackingAdmin,
  TrackingEventDto,
  AdminOrderTracking,
  CustomerShipment,
  PublicTrackingView,
} from "./types/shipping.js";
import type { MexicanState } from "./constants/shipping.js";
import {
  MEXICAN_STATES,
  MEXICAN_STATE_CODES,
  POSTAL_CODE_PATTERN,
  PHONE_PATTERN,
} from "./constants/shipping.js";
import { SHIPPING_CARRIER_LABELS, SHIPMENT_TRACKING_STATUS_LABELS } from "./labels/shipping.js";
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
import {
  MAX_STATUS_HISTORY,
  ORDER_NUMBER_ALPHABET,
  ORDER_NUMBER_PREFIX,
  ORDER_NUMBER_BODY_LENGTH,
  ORDER_NUMBER_PATTERN,
  DEFAULT_TAX_RATE_BPS,
  CANCEL_REASON_MIN,
  CANCEL_REASON_MAX,
  MAX_BULK_ORDERS,
  MAX_ORDER_ACTIVITY,
} from "./constants/order.js";
import type { OrderStatusGroup } from "./constants/orderStatusGroups.js";
import {
  ORDER_STATUS_TO_GROUP,
  ORDER_STATUS_GROUPS,
  matchStatusGroup,
} from "./constants/orderStatusGroups.js";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES } from "./constants/password.js";
import type { AuditLogEntry } from "./types/audit.js";
import type {
  RegisterRequest,
  VerifyEmailRequest,
  EmailOnlyRequest,
  ResetPasswordRequest,
  LoginRequest,
  LoginResponse,
  TwoFactorCodeRequest,
  EnrollmentStartResponse,
  MeResponse,
  ApiErrorBody,
} from "./types/auth.js";
import {
  ORDER_STATUS_LABELS,
  DISPUTE_STATUS_LABELS,
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_GROUP_LABELS,
} from "./labels/orderStatus.js";
import { TWO_FACTOR_INVALID_MESSAGE, INVALID_CREDENTIALS_MESSAGE } from "./labels/authMessages.js";

export type {
  Wire,
  OrderCustomer,
  ShippingAddress,
  ImageAttrs,
  OrderLine,
  PublicOrder,
  CustomerOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
  OrderSummary,
  OrderActivityEntry,
  BulkStatusOutcome,
  BulkStatusResult,
  PrintFamily,
  ProductCategory,
  Print,
  Measurements,
  Product,
  Variant,
  PublicVariant,
  PublicUser,
  AdminUser,
  ShippingOrigin,
  ShippingParcel,
  ShippingParcelSettings,
  ShippingRate,
  ShippingQuoteResponse,
  OrderShippingSelection,
  PublicShippingSelection,
  OrderLabelAdmin,
  OrderTrackingAdmin,
  TrackingEventDto,
  AdminOrderTracking,
  CustomerShipment,
  PublicTrackingView,
  MexicanState,
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
export type { OrderStatusGroup };
export {
  MAX_STATUS_HISTORY,
  ORDER_NUMBER_ALPHABET,
  ORDER_NUMBER_PREFIX,
  ORDER_NUMBER_BODY_LENGTH,
  ORDER_NUMBER_PATTERN,
  DEFAULT_TAX_RATE_BPS,
  CANCEL_REASON_MIN,
  CANCEL_REASON_MAX,
  MAX_BULK_ORDERS,
  MAX_ORDER_ACTIVITY,
  ORDER_STATUS_TO_GROUP,
  ORDER_STATUS_GROUPS,
  matchStatusGroup,
};
export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES };
export type {
  RegisterRequest,
  VerifyEmailRequest,
  EmailOnlyRequest,
  ResetPasswordRequest,
  LoginRequest,
  LoginResponse,
  TwoFactorCodeRequest,
  EnrollmentStartResponse,
  MeResponse,
  ApiErrorBody,
};
export {
  ORDER_STATUS_LABELS,
  DISPUTE_STATUS_LABELS,
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_GROUP_LABELS,
};
export { TWO_FACTOR_INVALID_MESSAGE, INVALID_CREDENTIALS_MESSAGE };
export {
  MEXICAN_STATES,
  MEXICAN_STATE_CODES,
  POSTAL_CODE_PATTERN,
  PHONE_PATTERN,
  SHIPPING_CARRIER_LABELS,
  SHIPMENT_TRACKING_STATUS_LABELS,
};
