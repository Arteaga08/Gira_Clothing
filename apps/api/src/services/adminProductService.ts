import { Types, type PipelineStage } from "mongoose";
import type { AdminProduct, ApiMeta, ImageAttrs, Measurements } from "@gira/shared";
import { Product } from "../models/Product.js";
import { AppError } from "../utils/AppError.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";

/**
 * Admin read model for the catalog: one Product with its category and a
 * summary of its variants (counts, cover, a few print thumbnails) resolved in
 * a single aggregation. The variant lookup runs AFTER the page is cut, so it
 * only touches the rows that leave the API.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["category", "name", "basePrice", "updatedAt"],
  searchable: ["name"],
  defaultSort: "category",
};

const PRINT_PREVIEW_LIMIT = 5;

interface AdminProductListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  category?: string;
  isActive?: boolean;
}

interface VariantSummaryRow {
  isActive: boolean;
  images: ImageAttrs[];
  printDoc: { _id: Types.ObjectId; name: string; image: ImageAttrs };
}

interface AdminProductRow {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  basePrice: number;
  weightGrams: number;
  measurements?: Measurements;
  materials?: string[];
  sizeImage?: ImageAttrs;
  bestSeller?: boolean;
  cardTags?: string[];
  cardPrint?: Types.ObjectId;
  isActive: boolean;
  updatedAt: Date;
  categoryDoc: { _id: Types.ObjectId; name: string; slug: string };
  variantDocs: VariantSummaryRow[];
}

const toAdminProduct = (row: AdminProductRow): AdminProduct => {
  const active = row.variantDocs.filter((variant) => variant.isActive);
  const cover =
    active.find((variant) => variant.images.length > 0)?.images[0] ??
    active[0]?.printDoc.image ??
    row.sizeImage;

  return {
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    category: { id: String(row.categoryDoc._id), name: row.categoryDoc.name, slug: row.categoryDoc.slug },
    ...(row.description ? { description: row.description } : {}),
    basePrice: row.basePrice,
    weightGrams: row.weightGrams,
    measurements: row.measurements ?? {},
    materials: row.materials ?? [],
    ...(row.sizeImage ? { sizeImage: row.sizeImage } : {}),
    bestSeller: row.bestSeller ?? false,
    cardTags: row.cardTags ?? [],
    ...(row.cardPrint ? { cardPrintId: String(row.cardPrint) } : {}),
    isActive: row.isActive,
    variantCount: row.variantDocs.length,
    activeVariantCount: active.length,
    ...(cover ? { cover } : {}),
    prints: active.slice(0, PRINT_PREVIEW_LIMIT).map((variant) => ({
      id: String(variant.printDoc._id),
      name: variant.printDoc.name,
      image: variant.printDoc.image,
    })),
    updatedAt: row.updatedAt,
  };
};

/** Joins product -> category. A product whose category is gone drops out. */
const CATEGORY_STAGES: PipelineStage[] = [
  {
    $lookup: { from: "productcategories", localField: "category", foreignField: "_id", as: "categoryDoc" },
  },
  { $unwind: "$categoryDoc" },
];

/** Variants of the product with only what the card paints: state, first photo, print name and image. */
const VARIANTS_LOOKUP: PipelineStage.Lookup = {
  $lookup: {
    from: "variants",
    let: { productId: "$_id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$product", "$$productId"] } } },
      { $sort: { createdAt: 1, _id: 1 } },
      { $lookup: { from: "prints", localField: "print", foreignField: "_id", as: "printDoc" } },
      { $unwind: "$printDoc" },
      {
        $project: {
          isActive: 1,
          images: { $slice: [{ $ifNull: ["$images", []] }, 1] },
          "printDoc._id": 1,
          "printDoc.name": 1,
          "printDoc.image": 1,
        },
      },
    ],
    as: "variantDocs",
  },
};

/** `category` sorts by the category NAME (then the model's), which only exists after the lookup. */
const toSortStage = (sort: Record<string, 1 | -1>): Record<string, 1 | -1> => {
  const field = Object.keys(sort)[0] as string;
  const direction = sort[field] as 1 | -1;
  if (field === "category") return { "categoryDoc.name": direction, name: 1, _id: 1 };
  return sort;
};

const listAdminProducts = async (
  query: AdminProductListQuery,
): Promise<{ items: AdminProduct[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.category) filters.category = new Types.ObjectId(query.category);
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);

  const [result] = await Product.aggregate<{ rows: AdminProductRow[]; total: { n: number }[] }>([
    { $match: filter },
    ...CATEGORY_STAGES,
    {
      $facet: {
        rows: [{ $sort: toSortStage(sort) }, { $skip: skip }, { $limit: limit }, VARIANTS_LOOKUP],
        total: [{ $count: "n" }],
      },
    },
  ]);

  const total = result?.total[0]?.n ?? 0;
  return { items: (result?.rows ?? []).map(toAdminProduct), meta: buildMeta(total, { page, limit }) };
};

const getAdminProductOrThrow = async (id: string): Promise<AdminProduct> => {
  const [row] = await Product.aggregate<AdminProductRow>([
    { $match: { _id: new Types.ObjectId(id) } },
    ...CATEGORY_STAGES,
    VARIANTS_LOOKUP,
  ]);
  if (!row) throw new AppError("El producto no existe.", 404);
  return toAdminProduct(row);
};

export type { AdminProductListQuery };
export { listAdminProducts, getAdminProductOrThrow };
