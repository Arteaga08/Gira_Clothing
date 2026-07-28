/**
 * Append-only audit trail taxonomy. Grows additively as new privileged actions
 * appear in later milestones (catalog, orders, shipping). M2 adds catalog and
 * inventory actions on top of M1's auth-only set.
 */

enum AuditModule {
  AUTH = "auth",
  CATALOG = "catalog",
  INVENTORY = "inventory",
}

enum AuditAction {
  LOGIN_SUCCESS = "login_success",
  LOGIN_FAILED = "login_failed",
  LOGOUT = "logout",
  TWO_FACTOR_SETUP = "two_factor_setup",
  TWO_FACTOR_ENABLED = "two_factor_enabled",
  TWO_FACTOR_DISABLED = "two_factor_disabled",
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
}

export { AuditModule, AuditAction };
