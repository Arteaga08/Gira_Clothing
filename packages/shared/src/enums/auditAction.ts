/**
 * Append-only audit trail taxonomy. Grows additively as new privileged actions
 * appear in later milestones (catalog, orders, shipping). M2 adds catalog and
 * inventory actions on top of M1's auth-only set.
 */

enum AuditModule {
  AUTH = "auth",
  CATALOG = "catalog",
  INVENTORY = "inventory",
  SETTINGS = "settings",
  CART = "cart",
  ORDERS = "orders",
  PAYMENTS = "payments",
  SHIPPING = "shipping",
  NOTIFICATIONS = "notifications",
  COUPONS = "coupons",
}

enum AuditAction {
  LOGIN_SUCCESS = "login_success",
  LOGIN_FAILED = "login_failed",
  LOGOUT = "logout",
  /** Every session of the account closed at once (M8.5). */
  LOGOUT_ALL = "logout_all",
  EMAIL_VERIFIED = "email_verified",
  PASSWORD_RESET_REQUESTED = "password_reset_requested",
  PASSWORD_RESET_COMPLETED = "password_reset_completed",
  TWO_FACTOR_SETUP = "two_factor_setup",
  TWO_FACTOR_ENABLED = "two_factor_enabled",
  // Kept: historical audit rows still carry it, even though the endpoint is gone (M8.4).
  TWO_FACTOR_DISABLED = "two_factor_disabled",
  TWO_FACTOR_FAILED = "two_factor_failed",
  TWO_FACTOR_LOCKED = "two_factor_locked",
  TWO_FACTOR_RESET = "two_factor_reset",
  PRINT_FAMILY_CREATED = "print_family_created",
  PRINT_FAMILY_UPDATED = "print_family_updated",
  PRINT_FAMILY_DEACTIVATED = "print_family_deactivated",
  PRINT_CREATED = "print_created",
  PRINT_UPDATED = "print_updated",
  PRINT_DEACTIVATED = "print_deactivated",
  PRODUCT_CATEGORY_CREATED = "product_category_created",
  PRODUCT_CATEGORY_UPDATED = "product_category_updated",
  PRODUCT_CATEGORY_DEACTIVATED = "product_category_deactivated",
  PRODUCT_CREATED = "product_created",
  PRODUCT_UPDATED = "product_updated",
  PRODUCT_DEACTIVATED = "product_deactivated",
  VARIANT_CREATED = "variant_created",
  VARIANT_UPDATED = "variant_updated",
  VARIANT_DEACTIVATED = "variant_deactivated",
  IMAGE_UPLOADED = "image_uploaded",
  STOCK_SET = "stock_set",
  STOCK_ADJUSTED = "stock_adjusted",
  SETTINGS_SHIPPING_UPDATED = "settings_shipping_updated",
  SETTINGS_CURRENCY_UPDATED = "settings_currency_updated",
  SETTINGS_RESERVATION_UPDATED = "settings_reservation_updated",
  COUPON_CREATED = "coupon_created",
  COUPON_UPDATED = "coupon_updated",
  COUPON_DEACTIVATED = "coupon_deactivated",
  COUPON_REACTIVATED = "coupon_reactivated",
  COUPON_GRANTED = "coupon_granted",
  ORDER_CREATED = "order_created",
  ORDER_STATUS_CHANGED = "order_status_changed",
  ORDER_EXPIRED = "order_expired",
  ORDER_REFUND_REQUESTED = "order_refund_requested",
  ORDER_PRIORITY_UPDATED = "order_priority_updated",
  ORDER_SHIPPING_ADDRESS_UPDATED = "order_shipping_address_updated",
  STOCK_RESERVED = "stock_reserved",
  STOCK_RESERVATION_COMMITTED = "stock_reservation_committed",
  STOCK_RESERVATION_RELEASED = "stock_reservation_released",
  STOCK_RESTOCKED_ON_REFUND = "stock_restocked_on_refund",
  PAYMENT_INTENT_CREATED = "payment_intent_created",
  PAYMENT_SUCCEEDED = "payment_succeeded",
  PAYMENT_FAILED = "payment_failed",
  PAYMENT_CANCELLED = "payment_cancelled",
  PAYMENT_REFUNDED = "payment_refunded",
  PAYMENT_DISPUTED = "payment_disputed",
  PAYMENT_DISPUTE_CLOSED = "payment_dispute_closed",
  /** The provider returned part of the charge; the order keeps its status. */
  PAYMENT_PARTIALLY_REFUNDED = "payment_partially_refunded",
  /** Committing the stock reservation threw after the order was already paid. */
  STOCK_COMMIT_FAILED = "stock_commit_failed",
  /** Full refund of an order whose units were never taken out of stock. */
  REFUND_WITHOUT_RESTOCK = "refund_without_restock",
  /** Money landed on an order that had already expired or been cancelled. */
  PAYMENT_AFTER_EXPIRY = "payment_after_expiry",
  /** An order went to paid but its hold was already gone: stock never left. */
  STOCK_COMMIT_MISSED = "stock_commit_missed",
  /** The provider refused to cancel the intent of an expired order. */
  PAYMENT_CANCEL_FAILED = "payment_cancel_failed",
  WEBHOOK_REJECTED = "webhook_rejected",
  SETTINGS_INVENTORY_UPDATED = "settings_inventory_updated",
  /** IVA rate edited in Ajustes (M12c); orders already created keep their frozen rate. */
  SETTINGS_TAX_UPDATED = "settings_tax_updated",
  /** Storefront announcement bar edited in Ajustes. */
  SETTINGS_ANNOUNCEMENT_UPDATED = "settings_announcement_updated",
  SETTINGS_HERO_UPDATED = "settings_hero_updated",
  SETTINGS_OFFER_BANNER_UPDATED = "settings_offer_banner_updated",
  SETTINGS_EVENTS_UPDATED = "settings_events_updated",
  LABEL_REQUESTED = "label_requested",
  LABEL_CREATED = "label_created",
  LABEL_FAILED = "label_failed",
  LABEL_NEEDS_REVIEW = "label_needs_review",
  LABEL_RETRY_REQUESTED = "label_retry_requested",
  LABEL_CANCEL_REQUESTED = "label_cancel_requested",
  LABEL_CANCELLED = "label_cancelled",
  ORDER_MARKED_SHIPPED = "order_marked_shipped",
  TRACKING_UPDATED = "tracking_updated",
  /** A parcel event arrived but the order was not moved (open/lost dispute). */
  TRACKING_TRANSITION_BLOCKED = "tracking_transition_blocked",
  NOTIFICATION_FAILED = "notification_failed",
}

export { AuditModule, AuditAction };
