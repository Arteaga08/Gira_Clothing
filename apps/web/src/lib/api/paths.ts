/**
 * Endpoint paths, relative to NEXT_PUBLIC_API_URL (which already ends in
 * /api/v1). They live apart from the modules that call them because
 * `/admin/notifications/health` has two callers on two sides of the
 * server/client boundary: stats.ts (server, next/headers) and outbox.ts
 * (browser). Importing the server module from a Client Component is a build
 * error, and two hand-written copies of a path is a silent 404.
 */
const STATS_OVERVIEW_PATH = "/admin/stats/overview";
const STATS_TIMESERIES_PATH = "/admin/stats/timeseries";
const STATS_TOP_PRODUCTS_PATH = "/admin/stats/top-products";
const OUTBOX_HEALTH_PATH = "/admin/notifications/health";
const ADMIN_ORDERS_PATH = "/admin/orders";
const ADMIN_VARIANTS_PATH = "/admin/variants";
const ADMIN_PRODUCTS_PATH = "/admin/products";
const ADMIN_CATEGORIES_PATH = "/admin/product-categories";
const ADMIN_FAMILIES_PATH = "/admin/print-families";
const ADMIN_PRINTS_PATH = "/admin/prints";
const ADMIN_UPLOADS_PATH = "/admin/uploads";
const ADMIN_COUPONS_PATH = "/admin/coupons";
const ADMIN_CUSTOMERS_PATH = "/admin/customers";
const ADMIN_SETTINGS_PATH = "/admin/settings";
const ADMIN_AUDIT_LOGS_PATH = "/admin/audit-logs";
const CART_PATH = "/cart";
const WISHLIST_PATH = "/wishlist";
const ACCOUNT_PATH = "/account";
const MY_ORDERS_PATH = "/orders/mine";
const STOREFRONT_ANNOUNCEMENT_PATH = "/storefront/announcement";
const STOREFRONT_HERO_PATH = "/storefront/hero";
const STOREFRONT_OFFER_BANNER_PATH = "/storefront/offer-banner";
const STOREFRONT_EVENTS_PATH = "/storefront/events";
const CATALOG_PRODUCTS_PATH = "/catalog/products";
const CATALOG_CATEGORIES_PATH = "/catalog/categories";
const CATALOG_PRINTS_PATH = "/catalog/prints";

export {
  STATS_OVERVIEW_PATH,
  STATS_TIMESERIES_PATH,
  STATS_TOP_PRODUCTS_PATH,
  OUTBOX_HEALTH_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_VARIANTS_PATH,
  ADMIN_PRODUCTS_PATH,
  ADMIN_CATEGORIES_PATH,
  ADMIN_FAMILIES_PATH,
  ADMIN_PRINTS_PATH,
  ADMIN_UPLOADS_PATH,
  ADMIN_COUPONS_PATH,
  ADMIN_CUSTOMERS_PATH,
  ADMIN_SETTINGS_PATH,
  ADMIN_AUDIT_LOGS_PATH,
  CART_PATH,
  WISHLIST_PATH,
  ACCOUNT_PATH,
  MY_ORDERS_PATH,
  STOREFRONT_ANNOUNCEMENT_PATH,
  STOREFRONT_HERO_PATH,
  STOREFRONT_OFFER_BANNER_PATH,
  STOREFRONT_EVENTS_PATH,
  CATALOG_PRODUCTS_PATH,
  CATALOG_CATEGORIES_PATH,
  CATALOG_PRINTS_PATH,
};
