import { AuditAction, AuditModule } from "@gira/shared";
import { Variant } from "../models/Variant.js";
import { Product } from "../models/Product.js";
import { Print } from "../models/Print.js";
import { AppError } from "../utils/AppError.js";
import { buildVariantSku } from "../utils/sku.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";
import type { ImageAttrs } from "../models/schemas/image.js";

/**
 * Variant CRUD — the only layer (besides inventoryService, Tarea 11) that
 * touches the Variant model. `sku` is derived once at creation and never
 * recomputed on update. Deactivation is a soft delete with no referential
 * guard below it — nothing sits under a variant.
 */

interface CreateVariantInput {
  product: string;
  print: string;
  sku?: string;
  images?: ImageAttrs[];
  priceOverride?: number;
}

interface UpdateVariantInput {
  images?: ImageAttrs[];
  priceOverride?: number | null;
  isActive?: boolean;
}

interface PublicVariant {
  id: string;
  product: string;
  print: string;
  sku: string;
  images: ImageAttrs[];
  priceOverride?: number;
  onHand: number;
  reserved: number;
  available: number;
  isActive: boolean;
}

interface VariantLean {
  _id: unknown;
  product: unknown;
  print: unknown;
  sku: string;
  images: ImageAttrs[];
  priceOverride?: number;
  onHand: number;
  reserved: number;
  isActive: boolean;
}

const toPublicVariant = (doc: VariantLean): PublicVariant => ({
  id: String(doc._id),
  product: String(doc.product),
  print: String(doc.print),
  sku: doc.sku,
  images: doc.images,
  ...(doc.priceOverride !== undefined ? { priceOverride: doc.priceOverride } : {}),
  onHand: doc.onHand,
  reserved: doc.reserved,
  available: doc.onHand - doc.reserved,
  isActive: doc.isActive,
});

const findActiveProductOrThrow = async (productId: string) => {
  const product = await Product.findOne({ _id: productId, isActive: true }).lean();
  if (!product) throw new AppError("El producto no existe.", 400);
  return product;
};

const findActivePrintOrThrow = async (printId: string) => {
  const print = await Print.findOne({ _id: printId, isActive: true }).lean();
  if (!print) throw new AppError("El estampado no existe.", 400);
  return print;
};

const createVariant = async (
  input: CreateVariantInput,
  ctx: RequestContext,
): Promise<PublicVariant> => {
  const [product, print] = await Promise.all([
    findActiveProductOrThrow(input.product),
    findActivePrintOrThrow(input.print),
  ]);

  const sku = input.sku ?? buildVariantSku(product.slug, print.sku);

  // Explicit field assignment — never spread the payload (anti mass-assignment).
  const created = await Variant.create({
    product: product._id,
    print: print._id,
    sku,
    images: input.images ?? [],
    priceOverride: input.priceOverride,
  });

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.VARIANT_CREATED,
    module: AuditModule.CATALOG,
    targetId: created.id as string,
    ip: ctx.ip,
  });

  return toPublicVariant(created.toObject());
};

const updateVariant = async (
  id: string,
  input: UpdateVariantInput,
  ctx: RequestContext,
): Promise<PublicVariant> => {
  const variant = await Variant.findById(id);
  if (!variant) throw new AppError("La variante no existe.", 404);

  // Reactivation guard (M2 post-review, pendiente #2): an active variant whose
  // product or print was retired is an ORPHAN. It stays hidden in the public
  // catalog but is still reachable by id, so letting it back on is a silent
  // trap. Retiring it, on the other hand, is always allowed.
  if (input.isActive === true && !variant.isActive) {
    const [product, print] = await Promise.all([
      Product.findById(variant.product).select("isActive").lean(),
      Print.findById(variant.print).select("isActive").lean(),
    ]);
    if (!product?.isActive) {
      throw new AppError(
        "No puedes reactivar esta variante: su producto está retirado. Reactiva primero el producto.",
        409,
      );
    }
    if (!print?.isActive) {
      throw new AppError(
        "No puedes reactivar esta variante: su estampado está retirado. Reactiva primero el estampado.",
        409,
      );
    }
  }

  if (input.images !== undefined) variant.images = input.images;
  if (input.priceOverride === null) variant.set("priceOverride", undefined);
  else if (input.priceOverride !== undefined) variant.priceOverride = input.priceOverride;
  if (input.isActive !== undefined) variant.isActive = input.isActive;

  await variant.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.VARIANT_UPDATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });

  return toPublicVariant(variant.toObject());
};

/** Soft delete. No referential guard — nothing sits below a variant. */
const deactivateVariant = async (id: string, ctx: RequestContext): Promise<PublicVariant> => {
  const variant = await Variant.findById(id);
  if (!variant) throw new AppError("La variante no existe.", 404);

  variant.isActive = false;
  await variant.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.VARIANT_DEACTIVATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });

  return toPublicVariant(variant.toObject());
};

export type { CreateVariantInput, UpdateVariantInput, PublicVariant };
export { createVariant, updateVariant, deactivateVariant };
