import type { AdminVariant, AdminVariantActivity, ApiMeta, InventoryStats, Wire } from "@gira/shared";
import { toInventoryCounts, type InventoryCounts } from "@/lib/inventory/stats";
import type { StockAdjustmentBody } from "@/lib/inventory/adjust";
import { toPanelVariant, type PanelVariant } from "@/lib/inventory/panelVariant";
import { assertVariantId } from "@/lib/inventory/variantId";
import { browserRequest } from "./browser";
import { ADMIN_VARIANTS_PATH } from "./paths";
import { expectData } from "./request";

/**
 * Browser-side client for /admin/variants. Reads and the stock mutation both go
 * through `browserRequest`: the list refreshes in the client, and the mutation
 * must leave with a real Origin header (see browser.ts). The server-only read of
 * the counts for the first paint lives in adminVariantsServer.ts.
 *
 * Variant endpoints wrap their payload in a named key (`variants`, `variant`,
 * `activity`); the stats endpoint spreads its DTO straight into `data`.
 */

const variantPath = (id: string, suffix = ""): string => `${ADMIN_VARIANTS_PATH}/${assertVariantId(id)}${suffix}`;

const listVariants = async (query: string): Promise<{ variants: PanelVariant[]; meta: ApiMeta }> => {
  const result = await browserRequest<{ variants: AdminVariant[] }>(`${ADMIN_VARIANTS_PATH}?${query}`);
  const { variants } = expectData(result);
  return {
    variants: variants.map(toPanelVariant),
    meta: result.meta ?? { total: variants.length, page: 1, pages: 1, limit: variants.length },
  };
};

const fetchInventoryCounts = async (): Promise<InventoryCounts> =>
  toInventoryCounts(expectData(await browserRequest<InventoryStats>(`${ADMIN_VARIANTS_PATH}/stats`)));

/** Count (`onHand`) or movement (`delta`), plus an optional reason. The API answers with the refreshed variant. */
const updateStock = async (id: string, body: StockAdjustmentBody): Promise<PanelVariant> =>
  toPanelVariant(
    expectData(await browserRequest<{ variant: AdminVariant }>(variantPath(id, "/stock"), { method: "PATCH", body }))
      .variant,
  );

const getVariantActivity = async (id: string): Promise<Wire<AdminVariantActivity>[]> =>
  expectData(await browserRequest<{ activity: AdminVariantActivity[] }>(variantPath(id, "/activity"))).activity;

export { listVariants, fetchInventoryCounts, updateStock, getVariantActivity };
