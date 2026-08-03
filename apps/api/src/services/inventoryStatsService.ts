import { Variant } from "../models/Variant.js";
import { getSettings } from "./settingsService.js";

/**
 * Stock health. NOT time-bounded: inventory is a snapshot of right now, and a
 * date range on it would be meaningless — which is why this module ignores
 * parseStatsRange entirely instead of accepting a range it would not use.
 *
 * The low-stock threshold comes from Settings, never from a constant here
 * (ECOMMERCE_ARCHITECTURE_GUIDELINES: no hardcoded business threshold once the
 * Settings singleton exists).
 */

const LOW_STOCK_SAMPLE = 20;

interface LowStockItem {
  id: string;
  sku: string;
  productName: string;
  available: number;
}

interface InventoryStats {
  lowStockThreshold: number;
  activeVariants: number;
  outOfStock: number;
  lowStock: number;
  unitsOnHand: number;
  unitsReserved: number;
  unitsAvailable: number;
  lowStockItems: LowStockItem[];
}

const getInventoryStats = async (): Promise<InventoryStats> => {
  const settings = await getSettings();
  const threshold = settings.inventory.lowStockThreshold;
  const available = { $subtract: ["$onHand", "$reserved"] };

  const [totals] = await Variant.aggregate<{
    activeVariants: number;
    outOfStock: number;
    lowStock: number;
    unitsOnHand: number;
    unitsReserved: number;
  }>([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        activeVariants: { $sum: 1 },
        outOfStock: { $sum: { $cond: [{ $lte: [available, 0] }, 1, 0] } },
        // Mutually exclusive with outOfStock: "low" means low, not empty.
        lowStock: {
          $sum: {
            $cond: [{ $and: [{ $gt: [available, 0] }, { $lte: [available, threshold] }] }, 1, 0],
          },
        },
        unitsOnHand: { $sum: "$onHand" },
        unitsReserved: { $sum: "$reserved" },
      },
    },
  ]);

  const lowStockItems = await Variant.aggregate<LowStockItem & { _id: unknown }>([
    { $match: { isActive: true } },
    { $addFields: { available } },
    { $match: { available: { $lte: threshold } } },
    { $sort: { available: 1 } },
    { $limit: LOW_STOCK_SAMPLE },
    { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productDoc" } },
    { $unwind: "$productDoc" },
    { $project: { sku: 1, available: 1, productName: "$productDoc.name" } },
  ]);

  const base = totals ?? {
    activeVariants: 0,
    outOfStock: 0,
    lowStock: 0,
    unitsOnHand: 0,
    unitsReserved: 0,
  };

  return {
    lowStockThreshold: threshold,
    // Named fields only — `totals` carries Mongo's aggregation `_id: null`
    // artifact, which a wholesale spread would otherwise leak into the API.
    activeVariants: base.activeVariants,
    outOfStock: base.outOfStock,
    lowStock: base.lowStock,
    unitsOnHand: base.unitsOnHand,
    unitsReserved: base.unitsReserved,
    unitsAvailable: base.unitsOnHand - base.unitsReserved,
    lowStockItems: lowStockItems.map((item) => ({
      id: String(item._id),
      sku: item.sku,
      productName: item.productName,
      available: item.available,
    })),
  };
};

export type { InventoryStats, LowStockItem };
export { getInventoryStats };
