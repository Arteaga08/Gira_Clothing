import type { InventoryStats } from "@gira/shared";
import { toInventoryCounts, type InventoryCounts } from "@/lib/inventory/stats";
import { ADMIN_VARIANTS_PATH } from "./paths";
import { expectData } from "./request";
import { serverRequest } from "./server";

/**
 * Server-only read of the inventory counts for the first paint, so the tabs and
 * the status badges already know the low-stock threshold. GET only, cookie
 * forwarded by `serverRequest`; the stats DTO is trimmed to what the panel uses
 * before anything reaches a Client Component.
 */
const getInventoryCounts = async (): Promise<InventoryCounts> =>
  toInventoryCounts(expectData(await serverRequest<InventoryStats>(`${ADMIN_VARIANTS_PATH}/stats`)));

export { getInventoryCounts };
