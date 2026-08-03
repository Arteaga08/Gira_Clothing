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

export { STATS_OVERVIEW_PATH, STATS_TIMESERIES_PATH, STATS_TOP_PRODUCTS_PATH, OUTBOX_HEALTH_PATH };
