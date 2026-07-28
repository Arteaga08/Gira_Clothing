import type { ApiMeta } from "@gira/shared";
import { AuditAction, AuditModule } from "@gira/shared";
import { Print } from "../models/Print.js";
import { PrintFamily } from "../models/PrintFamily.js";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import { slugify, resolveUniqueSlug } from "../utils/slug.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";
import type { ImageAttrs } from "../models/schemas/image.js";

/**
 * Print CRUD — the only layer that touches the Print model. Deactivation is a
 * soft delete guarded by referential integrity: a print with active variants
 * cannot be retired.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "sku", "createdAt", "updatedAt"],
  searchable: ["name", "sku"],
  defaultSort: "name",
};

interface CreatePrintInput {
  name: string;
  sku: string;
  family: string;
  image: ImageAttrs;
}

interface UpdatePrintInput {
  name?: string;
  sku?: string;
  family?: string;
  image?: ImageAttrs;
  isActive?: boolean;
}

interface PrintListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  family?: string;
  isActive?: boolean;
}

interface PublicFamilyRef {
  id: string;
  name: string;
  slug: string;
}

interface PublicPrint {
  id: string;
  name: string;
  slug: string;
  sku: string;
  family: PublicFamilyRef;
  image: ImageAttrs;
  isActive: boolean;
}

interface PrintLean {
  _id: unknown;
  name: string;
  slug: string;
  sku: string;
  family: unknown;
  image: ImageAttrs;
  isActive: boolean;
}

const toPublicPrint = (doc: PrintLean): PublicPrint => {
  const family = doc.family as { _id: unknown; name: string; slug: string };
  return {
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    sku: doc.sku,
    family: { id: String(family._id), name: family.name, slug: family.slug },
    image: doc.image,
    isActive: doc.isActive,
  };
};

const findActiveFamilyOrThrow = async (familyId: string) => {
  const family = await PrintFamily.findOne({ _id: familyId, isActive: true }).lean();
  if (!family) throw new AppError("La familia de estampados no existe.", 400);
  return family;
};

const createPrint = async (
  input: CreatePrintInput,
  ctx: RequestContext,
): Promise<PublicPrint> => {
  const family = await findActiveFamilyOrThrow(input.family);

  const slug = await resolveUniqueSlug(
    slugify(input.name),
    async (candidate) => (await Print.exists({ slug: candidate })) !== null,
  );

  // Explicit field assignment — never spread the payload (anti mass-assignment).
  const created = await Print.create({
    name: input.name,
    slug,
    sku: input.sku,
    family: family._id,
    image: input.image,
  });

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRINT_CREATED,
    module: AuditModule.CATALOG,
    targetId: created.id as string,
    ip: ctx.ip,
  });

  return toPublicPrint({ ...created.toObject(), family });
};

const listPrints = async (
  query: PrintListQuery,
): Promise<{ items: PublicPrint[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.family) filters.family = query.family;
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    Print.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("family", "name slug")
      .lean(),
    Print.countDocuments(filter),
  ]);

  return {
    items: docs.map(toPublicPrint),
    meta: buildMeta(total, { page, limit }),
  };
};

const getPrint = async (id: string): Promise<PublicPrint> => {
  const doc = await Print.findById(id).populate("family", "name slug").lean();
  if (!doc) throw new AppError("El estampado no existe.", 404);
  return toPublicPrint(doc);
};

const updatePrint = async (
  id: string,
  input: UpdatePrintInput,
  ctx: RequestContext,
): Promise<PublicPrint> => {
  const print = await Print.findById(id);
  if (!print) throw new AppError("El estampado no existe.", 404);

  if (input.isActive === false && print.isActive) {
    await assertNoActiveVariants(id);
  }

  if (input.name !== undefined && input.name !== print.name) {
    print.name = input.name;
    print.slug = await resolveUniqueSlug(
      slugify(input.name),
      async (candidate) => (await Print.exists({ slug: candidate, _id: { $ne: id } })) !== null,
    );
  }
  if (input.sku !== undefined) print.sku = input.sku;
  if (input.family !== undefined) {
    const family = await findActiveFamilyOrThrow(input.family);
    print.family = family._id;
  }
  if (input.image !== undefined) print.image = input.image;
  if (input.isActive !== undefined) print.isActive = input.isActive;

  await print.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRINT_UPDATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });

  return getPrint(id);
};

/** Throws 409 if the print still has active variants. */
const assertNoActiveVariants = async (printId: string): Promise<void> => {
  const activeChildren = await Variant.countDocuments({ print: printId, isActive: true });
  if (activeChildren > 0) {
    throw new AppError(
      "No puedes retirar un estampado con variantes activas. Retira primero sus variantes.",
      409,
    );
  }
};

/** Soft delete guarded by referential integrity against active Variant children. */
const deactivatePrint = async (id: string, ctx: RequestContext): Promise<PublicPrint> => {
  const print = await Print.findById(id);
  if (!print) throw new AppError("El estampado no existe.", 404);

  await assertNoActiveVariants(id);

  print.isActive = false;
  await print.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRINT_DEACTIVATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });

  return getPrint(id);
};

export type { CreatePrintInput, UpdatePrintInput, PrintListQuery, PublicPrint };
export { createPrint, listPrints, getPrint, updatePrint, deactivatePrint };
