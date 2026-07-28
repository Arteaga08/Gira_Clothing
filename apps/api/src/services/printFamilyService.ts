import type { ApiMeta } from "@gira/shared";
import { AuditAction, AuditModule } from "@gira/shared";
import { PrintFamily } from "../models/PrintFamily.js";
import { Print } from "../models/Print.js";
import { AppError } from "../utils/AppError.js";
import { slugify, resolveUniqueSlug } from "../utils/slug.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * PrintFamily CRUD — the only layer that touches the PrintFamily model.
 * Deactivation is a soft delete guarded by referential integrity: a family
 * with active prints cannot be retired, or the catalog would show orphaned
 * prints. The same guard runs on PATCH { isActive: false }.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "createdAt", "updatedAt"],
  searchable: ["name"],
  defaultSort: "name",
};

interface CreatePrintFamilyInput {
  name: string;
  description?: string;
}

interface UpdatePrintFamilyInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

interface PrintFamilyListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  isActive?: boolean;
}

interface PublicPrintFamily {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

interface PrintFamilyLean {
  _id: unknown;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

// .lean() docs have no `id` virtual — map _id explicitly.
const toPublicPrintFamily = (doc: PrintFamilyLean): PublicPrintFamily => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  ...(doc.description ? { description: doc.description } : {}),
  isActive: doc.isActive,
});

const createPrintFamily = async (
  input: CreatePrintFamilyInput,
  ctx: RequestContext,
): Promise<PublicPrintFamily> => {
  const slug = await resolveUniqueSlug(
    slugify(input.name),
    async (candidate) => (await PrintFamily.exists({ slug: candidate })) !== null,
  );

  // Explicit field assignment — never spread the payload (anti mass-assignment).
  const created = await PrintFamily.create({
    name: input.name,
    slug,
    description: input.description,
  });

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRINT_FAMILY_CREATED,
    module: AuditModule.CATALOG,
    targetId: created.id as string,
    ip: ctx.ip,
  });

  return toPublicPrintFamily(created.toObject());
};

const listPrintFamilies = async (
  query: PrintFamilyListQuery,
): Promise<{ items: PublicPrintFamily[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    PrintFamily.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    PrintFamily.countDocuments(filter),
  ]);

  return { items: docs.map(toPublicPrintFamily), meta: buildMeta(total, { page, limit }) };
};

const getPrintFamily = async (id: string): Promise<PublicPrintFamily> => {
  const family = await PrintFamily.findById(id).lean();
  if (!family) throw new AppError("La familia de estampados no existe.", 404);
  return toPublicPrintFamily(family);
};

/** Throws 409 if the family still has active prints. */
const assertNoActivePrints = async (familyId: string): Promise<void> => {
  const activeChildren = await Print.countDocuments({ family: familyId, isActive: true });
  if (activeChildren > 0) {
    throw new AppError(
      "No puedes retirar una familia con estampados activos. Retira primero sus estampados.",
      409,
    );
  }
};

const updatePrintFamily = async (
  id: string,
  input: UpdatePrintFamilyInput,
  ctx: RequestContext,
): Promise<PublicPrintFamily> => {
  const family = await PrintFamily.findById(id);
  if (!family) throw new AppError("La familia de estampados no existe.", 404);

  if (input.isActive === false && family.isActive) {
    await assertNoActivePrints(id);
  }

  if (input.name !== undefined && input.name !== family.name) {
    family.name = input.name;
    family.slug = await resolveUniqueSlug(
      slugify(input.name),
      async (candidate) =>
        (await PrintFamily.exists({ slug: candidate, _id: { $ne: id } })) !== null,
    );
  }
  if (input.description !== undefined) family.description = input.description;
  if (input.isActive !== undefined) family.isActive = input.isActive;

  await family.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRINT_FAMILY_UPDATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });

  return toPublicPrintFamily(family.toObject());
};

/** Soft delete guarded by referential integrity against active Print children. */
const deactivatePrintFamily = async (
  id: string,
  ctx: RequestContext,
): Promise<PublicPrintFamily> => {
  const family = await PrintFamily.findById(id);
  if (!family) throw new AppError("La familia de estampados no existe.", 404);

  await assertNoActivePrints(id);

  family.isActive = false;
  await family.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRINT_FAMILY_DEACTIVATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });

  return toPublicPrintFamily(family.toObject());
};

export type {
  CreatePrintFamilyInput,
  UpdatePrintFamilyInput,
  PrintFamilyListQuery,
  PublicPrintFamily,
};
export {
  createPrintFamily,
  listPrintFamilies,
  getPrintFamily,
  updatePrintFamily,
  deactivatePrintFamily,
};
