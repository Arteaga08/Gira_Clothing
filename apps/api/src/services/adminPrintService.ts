import { Types, type PipelineStage } from "mongoose";
import type { AdminPrint, ApiMeta, ImageAttrs } from "@gira/shared";
import { Print } from "../models/Print.js";
import { AppError } from "../utils/AppError.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";

/**
 * Admin read model for prints: the print, its family, and how much of the
 * catalog uses it (variant counts and the models behind the active ones),
 * resolved in one aggregation. The variant lookup runs AFTER the page is cut,
 * so it only touches the rows that leave the API.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "sku", "updatedAt"],
  searchable: ["name", "sku"],
  defaultSort: "name",
  defaultLimit: 24,
};

const ACTIVE_PRODUCTS_LIMIT = 10;

interface AdminPrintListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  family?: string;
  isActive?: boolean;
}

interface AdminPrintRow {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  sku: string;
  image: ImageAttrs;
  isActive: boolean;
  homePosition?: number;
  homeBlurb?: string;
  updatedAt: Date;
  familyDoc: { _id: Types.ObjectId; name: string; slug: string };
  variantDocs: { isActive: boolean; productDoc?: { _id: Types.ObjectId; name: string } }[];
}

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, "es");

const toAdminPrint = (row: AdminPrintRow): AdminPrint => {
  const active = row.variantDocs.filter((variant) => variant.isActive);
  const products = active
    .flatMap((variant) =>
      variant.productDoc ? [{ id: String(variant.productDoc._id), name: variant.productDoc.name }] : [],
    )
    .sort(byName)
    .slice(0, ACTIVE_PRODUCTS_LIMIT);

  return {
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    family: { id: String(row.familyDoc._id), name: row.familyDoc.name, slug: row.familyDoc.slug },
    image: row.image,
    isActive: row.isActive,
    ...(row.homePosition !== undefined ? { homePosition: row.homePosition } : {}),
    ...(row.homeBlurb ? { homeBlurb: row.homeBlurb } : {}),
    variantCount: row.variantDocs.length,
    activeVariantCount: active.length,
    activeProducts: products,
    updatedAt: row.updatedAt,
  };
};

/** Joins print -> family. A print whose family is gone drops out. */
const FAMILY_STAGES: PipelineStage[] = [
  { $lookup: { from: "printfamilies", localField: "family", foreignField: "_id", as: "familyDoc" } },
  { $unwind: "$familyDoc" },
];

/** Variants of the print with the model's name: only what the card and the retire guard paint. */
const VARIANTS_LOOKUP: PipelineStage.Lookup = {
  $lookup: {
    from: "variants",
    let: { printId: "$_id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$print", "$$printId"] } } },
      { $project: { isActive: 1, product: 1 } },
      { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productDoc" } },
      { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
      { $project: { isActive: 1, "productDoc._id": 1, "productDoc.name": 1 } },
    ],
    as: "variantDocs",
  },
};

const listAdminPrints = async (
  query: AdminPrintListQuery,
): Promise<{ items: AdminPrint[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.family) filters.family = new Types.ObjectId(query.family);
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);

  const [result] = await Print.aggregate<{ rows: AdminPrintRow[]; total: { n: number }[] }>([
    { $match: filter },
    ...FAMILY_STAGES,
    {
      $facet: {
        rows: [{ $sort: sort }, { $skip: skip }, { $limit: limit }, VARIANTS_LOOKUP],
        total: [{ $count: "n" }],
      },
    },
  ]);

  const total = result?.total[0]?.n ?? 0;
  return { items: (result?.rows ?? []).map(toAdminPrint), meta: buildMeta(total, { page, limit }) };
};

const getAdminPrintOrThrow = async (id: string): Promise<AdminPrint> => {
  const [row] = await Print.aggregate<AdminPrintRow>([
    { $match: { _id: new Types.ObjectId(id) } },
    ...FAMILY_STAGES,
    VARIANTS_LOOKUP,
  ]);
  if (!row) throw new AppError("El estampado no existe.", 404);
  return toAdminPrint(row);
};

export type { AdminPrintListQuery };
export { listAdminPrints, getAdminPrintOrThrow };
