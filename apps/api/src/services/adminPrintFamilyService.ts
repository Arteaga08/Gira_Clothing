import { Types, type PipelineStage } from "mongoose";
import type { AdminPrintFamily, ApiMeta } from "@gira/shared";
import { PrintFamily } from "../models/PrintFamily.js";
import { AppError } from "../utils/AppError.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";

/**
 * Admin read model for print families: the family and how many prints it
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

const ACTIVE_PRINTS_LIMIT = 10;

interface AdminPrintFamilyListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  isActive?: boolean;
}

interface AdminPrintFamilyRow {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  updatedAt: Date;
  printDocs: { _id: Types.ObjectId; name: string; isActive: boolean }[];
}

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, "es");

const toAdminPrintFamily = (row: AdminPrintFamilyRow): AdminPrintFamily => {
  const active = row.printDocs.filter((print) => print.isActive);
  return {
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    ...(row.description ? { description: row.description } : {}),
    isActive: row.isActive,
    printCount: row.printDocs.length,
    activePrintCount: active.length,
    activePrints: active
      .map((print) => ({ id: String(print._id), name: print.name }))
      .sort(byName)
      .slice(0, ACTIVE_PRINTS_LIMIT),
    updatedAt: row.updatedAt,
  };
};

/** Prints of the family: only what the table and the retire guard paint. */
const PRINTS_LOOKUP: PipelineStage.Lookup = {
  $lookup: {
    from: "prints",
    let: { familyId: "$_id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$family", "$$familyId"] } } },
      { $project: { name: 1, isActive: 1 } },
    ],
    as: "printDocs",
  },
};

const listAdminPrintFamilies = async (
  query: AdminPrintFamilyListQuery,
): Promise<{ items: AdminPrintFamily[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);

  const [result] = await PrintFamily.aggregate<{ rows: AdminPrintFamilyRow[]; total: { n: number }[] }>([
    { $match: filter },
    {
      $facet: {
        rows: [{ $sort: sort }, { $skip: skip }, { $limit: limit }, PRINTS_LOOKUP],
        total: [{ $count: "n" }],
      },
    },
  ]).collation(NAME_COLLATION);

  const total = result?.total[0]?.n ?? 0;
  return { items: (result?.rows ?? []).map(toAdminPrintFamily), meta: buildMeta(total, { page, limit }) };
};

const getAdminPrintFamilyOrThrow = async (id: string): Promise<AdminPrintFamily> => {
  const [row] = await PrintFamily.aggregate<AdminPrintFamilyRow>([
    { $match: { _id: new Types.ObjectId(id) } },
    PRINTS_LOOKUP,
  ]);
  if (!row) throw new AppError("La familia de estampados no existe.", 404);
  return toAdminPrintFamily(row);
};

export type { AdminPrintFamilyListQuery };
export { listAdminPrintFamilies, getAdminPrintFamilyOrThrow };
