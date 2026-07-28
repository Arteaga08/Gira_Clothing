import type { ApiMeta } from "@gira/shared";
import { AuditAction, AuditModule } from "@gira/shared";
import { Variant } from "../models/Variant.js";
import { Product } from "../models/Product.js";
import { Print } from "../models/Print.js";
import { AppError } from "../utils/AppError.js";
import { buildVariantSku } from "../utils/sku.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";
import type { ImageAttrs } from "../models/schemas/image.js";

/**
 * Variant CRUD — the only layer (besides inventoryService, Tarea 11) that
 * touches the Variant model. `sku` is derived once at creation and never
 * recomputed on update. Deactivation is a soft delete with no referential
 * guard below it — nothing sits under a variant.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["sku", "createdAt", "updatedAt"],
  searchable: ["sku"],
  defaultSort: "sku",
};

interface CreateVariantInput {
  product: string;
  print: string;
  sku?: string;
  images?: ImageAttrs[];
  priceOverride?: number;
}

interface UpdateVariantInput {
  images?: ImageAttrs[];
  priceOverride?: number;
  isActive?: boolean;
}

interface VariantListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  product?: string;
  print?: string;
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

const listVariants = async (
  query: VariantListQuery,
): Promise<{ items: PublicVariant[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.product) filters.product = query.product;
  if (query.print) filters.print = query.print;
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    Variant.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Variant.countDocuments(filter),
  ]);

  return { items: docs.map(toPublicVariant), meta: buildMeta(total, { page, limit }) };
};

const getVariant = async (id: string): Promise<PublicVariant> => {
  const doc = await Variant.findById(id).lean();
  if (!doc) throw new AppError("La variante no existe.", 404);
  return toPublicVariant(doc);
};

const updateVariant = async (
  id: string,
  input: UpdateVariantInput,
  ctx: RequestContext,
): Promise<PublicVariant> => {
  const variant = await Variant.findById(id);
  if (!variant) throw new AppError("La variante no existe.", 404);

  if (input.images !== undefined) variant.images = input.images;
  if (input.priceOverride !== undefined) variant.priceOverride = input.priceOverride;
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

export type { CreateVariantInput, UpdateVariantInput, VariantListQuery, PublicVariant };
export { createVariant, listVariants, getVariant, updateVariant, deactivateVariant };
