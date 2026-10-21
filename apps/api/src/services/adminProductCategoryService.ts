import { Types, type PipelineStage } from "mongoose";
import type { AdminProductCategory, ApiMeta } from "@gira/shared";
import { ProductCategory } from "../models/ProductCategory.js";
import { AppError } from "../utils/AppError.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";

/**
 * Admin read model for product categories: the category and how many products it
 * holds (and which active ones), resolved in one aggregation. The print lookup
 * runs AFTER the page is cut, so it only touches the rows that leave the API.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "updatedAt"],
  searchable: ["name"],
  defaultSort: "name",
  defaultLimit: 24,
};

/** Spanish collation, case-insensitive: "Árboles" sorts with the As and "rayas" next to "Rayas" (a binary sort puts them last). */
const NAME_COLLATION = { locale: "es", strength: 2 } as const;

const ACTIVE_PRODUCTS_LIMIT = 10;

interface AdminProductCategoryListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  isActive?: boolean;
}

interface AdminProductCategoryRow {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  updatedAt: Date;
  productDocs: { _id: Types.ObjectId; name: string; isActive: boolean }[];
}

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, "es");

const toAdminProductCategory = (row: AdminProductCategoryRow): AdminProductCategory => {
  const active = row.productDocs.filter((product) => product.isActive);
  return {
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    ...(row.description ? { description: row.description } : {}),
    isActive: row.isActive,
    productCount: row.productDocs.length,
    activeProductCount: active.length,
    activeProducts: active
      .map((product) => ({ id: String(product._id), name: product.name }))
      .sort(byName)
      .slice(0, ACTIVE_PRODUCTS_LIMIT),
    updatedAt: row.updatedAt,
  };
};

/** Models of the category: only what the table and the retire guard paint. */
const PRODUCTS_LOOKUP: PipelineStage.Lookup = {
  $lookup: {
    from: "products",
    let: { categoryId: "$_id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$category", "$$categoryId"] } } },
      { $project: { name: 1, isActive: 1 } },
    ],
    as: "productDocs",
  },
};

const listAdminProductCategories = async (
  query: AdminProductCategoryListQuery,
): Promise<{ items: AdminProductCategory[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);

  const [result] = await ProductCategory.aggregate<{ rows: AdminProductCategoryRow[]; total: { n: number }[] }>([
    { $match: filter },
    {
      $facet: {
        rows: [{ $sort: sort }, { $skip: skip }, { $limit: limit }, PRODUCTS_LOOKUP],
        total: [{ $count: "n" }],
      },
    },
  ]).collation(NAME_COLLATION);

  const total = result?.total[0]?.n ?? 0;
  return { items: (result?.rows ?? []).map(toAdminProductCategory), meta: buildMeta(total, { page, limit }) };
};

const getAdminProductCategoryOrThrow = async (id: string): Promise<AdminProductCategory> => {
  const [row] = await ProductCategory.aggregate<AdminProductCategoryRow>([
    { $match: { _id: new Types.ObjectId(id) } },
    PRODUCTS_LOOKUP,
  ]);
  if (!row) throw new AppError("La categoría no existe.", 404);
  return toAdminProductCategory(row);
};

export type { AdminProductCategoryListQuery };
export { listAdminProductCategories, getAdminProductCategoryOrThrow };
