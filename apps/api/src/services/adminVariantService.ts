import { Types, type PipelineStage } from "mongoose";
import type {
  AdminVariant,
  AdminVariantActivity,
  ApiMeta,
  ImageAttrs,
  StockStatus,
} from "@gira/shared";
import { AuditAction, AuditModule } from "@gira/shared";
import { Variant } from "../models/Variant.js";
import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import {
  parseListQuery,
  buildMeta,
  escapeRegex,
  type ListQueryConfig,
} from "../utils/parseListQuery.js";
import { getSettings } from "./settingsService.js";

/**
 * Admin read model for inventory: one Variant with its product, category and
 * print resolved in a single aggregation. The low-stock threshold always comes
 * from Settings (never a constant here).
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["sku", "available", "updatedAt"],
  // Search crosses collections ($lookup), so it is built below, not by parseListQuery.
  searchable: [],
  defaultSort: "sku",
};

const ACTIVITY_LIMIT = 20;
const STOCK_ACTIONS = [AuditAction.STOCK_SET, AuditAction.STOCK_ADJUSTED];

interface AdminVariantListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  product?: string;
  print?: string;
  category?: string;
  isActive?: boolean;
  stock?: StockStatus;
}

interface AdminVariantRow {
  _id: Types.ObjectId;
  sku: string;
  priceOverride?: number;
  onHand: number;
  reserved: number;
  available: number;
  isActive: boolean;
  updatedAt: Date;
  productDoc: {
    _id: Types.ObjectId;
    name: string;
    slug: string;
    categoryDoc: { _id: Types.ObjectId; name: string; slug: string };
  };
  printDoc: { _id: Types.ObjectId; name: string; sku: string; image: ImageAttrs };
}

const toAdminVariant = (row: AdminVariantRow): AdminVariant => ({
  id: String(row._id),
  sku: row.sku,
  product: {
    id: String(row.productDoc._id),
    name: row.productDoc.name,
    slug: row.productDoc.slug,
    category: {
      id: String(row.productDoc.categoryDoc._id),
      name: row.productDoc.categoryDoc.name,
      slug: row.productDoc.categoryDoc.slug,
    },
  },
  print: {
    id: String(row.printDoc._id),
    name: row.printDoc.name,
    sku: row.printDoc.sku,
    image: row.printDoc.image,
  },
  ...(row.priceOverride !== undefined ? { priceOverride: row.priceOverride } : {}),
  onHand: row.onHand,
  reserved: row.reserved,
  available: row.available,
  isActive: row.isActive,
  updatedAt: row.updatedAt,
});

/** Joins product -> category and print, and computes `available`. Orphans (missing parent) drop out. */
const JOIN_STAGES: PipelineStage[] = [
  { $addFields: { available: { $subtract: ["$onHand", "$reserved"] } } },
  { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productDoc" } },
  { $unwind: "$productDoc" },
  {
    $lookup: {
      from: "productcategories",
      localField: "productDoc.category",
      foreignField: "_id",
      as: "productDoc.categoryDoc",
    },
  },
  { $unwind: "$productDoc.categoryDoc" },
  { $lookup: { from: "prints", localField: "print", foreignField: "_id", as: "printDoc" } },
  { $unwind: "$printDoc" },
];

const stockMatch = (stock: StockStatus, threshold: number): Record<string, unknown> => {
  if (stock === "out") return { available: { $lte: 0 } };
  if (stock === "low") return { available: { $gt: 0, $lte: threshold } };
  return { available: { $gt: threshold } };
};

const listAdminVariants = async (
  query: AdminVariantListQuery,
): Promise<{ items: AdminVariant[]; meta: ApiMeta }> => {
  const { sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG);
  // Only the stock-status filter needs the threshold; reading it for every list
  // call put a whole extra database round trip in front of the aggregate.
  const threshold = query.stock ? (await getSettings()).inventory.lowStockThreshold : 0;

  const base: Record<string, unknown> = {};
  if (query.product) base.product = new Types.ObjectId(query.product);
  if (query.print) base.print = new Types.ObjectId(query.print);
  if (query.isActive !== undefined) base.isActive = query.isActive;

  const joined: Record<string, unknown> = {};
  if (query.category) joined["productDoc.category"] = new Types.ObjectId(query.category);
  if (query.stock) Object.assign(joined, stockMatch(query.stock, threshold));
  const term = typeof query.search === "string" ? query.search.trim().slice(0, 80) : "";
  if (term) {
    const rx = new RegExp(escapeRegex(term), "i");
    joined.$or = [{ sku: rx }, { "productDoc.name": rx }, { "printDoc.name": rx }];
  }

  const [result] = await Variant.aggregate<{
    rows: AdminVariantRow[];
    total: { n: number }[];
  }>([
    { $match: base },
    ...JOIN_STAGES,
    { $match: joined },
    {
      $facet: {
        rows: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: "n" }],
      },
    },
  ]);

  const total = result?.total[0]?.n ?? 0;
  return {
    items: (result?.rows ?? []).map(toAdminVariant),
    meta: buildMeta(total, { page, limit }),
  };
};

/** One AdminVariant by id, or null when the variant (or one of its parents) is gone. */
const findAdminVariant = async (id: string): Promise<AdminVariant | null> => {
  const [row] = await Variant.aggregate<AdminVariantRow>([
    { $match: { _id: new Types.ObjectId(id) } },
    ...JOIN_STAGES,
  ]);
  return row ? toAdminVariant(row) : null;
};

const getAdminVariantOrThrow = async (id: string): Promise<AdminVariant> => {
  const variant = await findAdminVariant(id);
  if (!variant) throw new AppError("La variante no existe.", 404);
  return variant;
};

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

/** Last stock movements of one variant. Actor by name; only the mapped fields leave the API. */
const getVariantActivity = async (id: string): Promise<AdminVariantActivity[]> => {
  const exists = await Variant.exists({ _id: id });
  if (!exists) throw new AppError("La variante no existe.", 404);

  const rows = await AuditLog.find({
    targetId: id,
    module: AuditModule.INVENTORY,
    action: { $in: STOCK_ACTIONS },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(ACTIVITY_LIMIT)
    .select("action actorId createdAt before after")
    .lean();

  const actorIds = [...new Set(rows.flatMap((r) => (r.actorId ? [String(r.actorId)] : [])))];
  const actors = actorIds.length
    ? await User.find({ _id: { $in: actorIds } })
        .select("firstName lastName")
        .lean()
    : [];
  const nameById = new Map(
    actors.map((u) => [String(u._id), `${u.firstName} ${u.lastName}`.trim()]),
  );

  return rows.map((row) => {
    const before = numberOrUndefined(row.before?.onHand);
    const after = numberOrUndefined(row.after?.onHand);
    const reason = typeof row.after?.reason === "string" ? row.after.reason : undefined;
    return {
      id: String(row._id),
      action: row.action,
      createdAt: row.createdAt,
      actorName: row.actorId ? (nameById.get(String(row.actorId)) ?? "Administrador") : "Sistema",
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      ...(before !== undefined && after !== undefined ? { delta: after - before } : {}),
      ...(reason ? { reason } : {}),
    };
  });
};

export type { AdminVariantListQuery };
export { listAdminVariants, findAdminVariant, getAdminVariantOrThrow, getVariantActivity };
