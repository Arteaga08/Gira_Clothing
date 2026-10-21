import { AuditAction, AuditModule, type AdminPrint } from "@gira/shared";
import { Print } from "../models/Print.js";
import { PrintFamily } from "../models/PrintFamily.js";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import { slugify, resolveUniqueSlug } from "../utils/slug.js";
import { recordAudit } from "./auditService.js";
import { getAdminPrintOrThrow } from "./adminPrintService.js";
import type { RequestContext } from "../utils/requestContext.js";
import type { ImageAttrs } from "../models/schemas/image.js";

/**
 * Print CRUD — the only layer that touches the Print model. Deactivation is a
 * soft delete guarded by referential integrity: a print with active variants
 * cannot be retired.
 */

interface CreatePrintInput {
  name: string;
  sku: string;
  family: string;
  image: ImageAttrs;
}

interface UpdatePrintInput {
  name?: string;
  family?: string;
  image?: ImageAttrs;
  isActive?: boolean;
}

const findActiveFamilyOrThrow = async (familyId: string) => {
  const family = await PrintFamily.findOne({ _id: familyId, isActive: true }).lean();
  if (!family) throw new AppError("La familia de estampados no existe.", 400);
  return family;
};

const createPrint = async (
  input: CreatePrintInput,
  ctx: RequestContext,
): Promise<AdminPrint> => {
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

  return getAdminPrintOrThrow(created.id as string);
};

const updatePrint = async (
  id: string,
  input: UpdatePrintInput,
  ctx: RequestContext,
): Promise<AdminPrint> => {
  const print = await Print.findById(id);
  if (!print) throw new AppError("El estampado no existe.", 404);

  if (input.isActive === false && print.isActive) {
    await assertNoActiveVariants(id);
  }

  // Reactivation guard (same pattern as variantService): a print cannot go
  // back to active under a family that is itself retired. When `family` also
  // changes in this call, `findActiveFamilyOrThrow` below already guarantees
  // the new family is active, so this only checks the current one.
  if (input.isActive === true && !print.isActive && input.family === undefined) {
    const family = await PrintFamily.findById(print.family).select("isActive").lean();
    if (!family?.isActive) {
      throw new AppError(
        "No puedes reactivar este estampado: su familia está retirada. Reactiva primero la familia o asígnale una familia activa.",
        409,
      );
    }
  }

  if (input.name !== undefined && input.name !== print.name) {
    print.name = input.name;
    print.slug = await resolveUniqueSlug(
      slugify(input.name),
      async (candidate) => (await Print.exists({ slug: candidate, _id: { $ne: id } })) !== null,
    );
  }
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

  return getAdminPrintOrThrow(id);
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
const deactivatePrint = async (id: string, ctx: RequestContext): Promise<AdminPrint> => {
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

  return getAdminPrintOrThrow(id);
};

export type { CreatePrintInput, UpdatePrintInput };
export { createPrint, updatePrint, deactivatePrint };
