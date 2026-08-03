import { getOrderStats, type OrderStats } from "./orderStatsService.js";
import { getInventoryStats, type InventoryStats } from "./inventoryStatsService.js";
import type { StatsRangeQuery } from "../utils/parseStatsRange.js";

/**
 * Pure composition (BACKEND_ARCHITECTURE_GUIDELINES, "Endpoint de
 * resumen/overview"): it orchestrates the modules' own stats services in
 * parallel and reimplements NOTHING. If a number here ever disagrees with the
 * module endpoint, the bug is that someone added logic to this file.
 *
 * Heavy payloads get trimmed — an overview is a summary, not a mirror of every
 * listing.
 */

const OVERVIEW_TOP = 5;

interface Overview {
  orders: OrderStats;
  inventory: InventoryStats;
}

const getOverview = async (query: StatsRangeQuery): Promise<Overview> => {
  const [orders, inventory] = await Promise.all([getOrderStats(query), getInventoryStats()]);

  return {
    orders: {
      ...orders,
      period: {
        ...orders.period,
        topProducts: orders.period.topProducts.slice(0, OVERVIEW_TOP),
        topPrints: orders.period.topPrints.slice(0, OVERVIEW_TOP),
      },
    },
    inventory: { ...inventory, lowStockItems: inventory.lowStockItems.slice(0, OVERVIEW_TOP) },
  };
};

export type { Overview };
export { getOverview };
