import type { AdminVariant, AdminVariantActivity, ApiMeta, ImageAttrs, InventoryStats, Wire } from "@gira/shared";
import { toExistingVariant, type ExistingVariant } from "@/lib/catalog/editorProduct";
import { assertProductId } from "@/lib/catalog/productId";
import type { VariantPatch } from "@/lib/catalog/productForm";
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

/** Every variant of one model (active or not), with its photos, for the editor. One page: a model never has 100 prints. */
const listProductVariants = async (productId: string): Promise<ExistingVariant[]> => {
  const query = new URLSearchParams({
    product: assertProductId(productId),
    withImages: "true",
    sort: "sku",
    page: "1",
    limit: "100",
  });
  const { variants } = expectData(await browserRequest<{ variants: AdminVariant[] }>(`${ADMIN_VARIANTS_PATH}?${query.toString()}`));
  return variants.map(toExistingVariant);
};

interface CreateVariantBody {
  product: string;
  print: string;
  images: ImageAttrs[];
  priceOverride?: number;
}

const createVariant = async (body: CreateVariantBody): Promise<ExistingVariant> =>
  toExistingVariant(
    expectData(await browserRequest<{ variant: AdminVariant }>(ADMIN_VARIANTS_PATH, { method: "POST", body })).variant,
  );

/** Photos, price override (`null` removes it) and the active flag: the only things the catalog edits on a variant. */
const updateVariant = async (id: string, patch: VariantPatch): Promise<ExistingVariant> =>
  toExistingVariant(
    expectData(await browserRequest<{ variant: AdminVariant }>(variantPath(id), { method: "PATCH", body: patch })).variant,
  );

export { listVariants, fetchInventoryCounts, updateStock, getVariantActivity, listProductVariants, createVariant, updateVariant };
export type { CreateVariantBody };
