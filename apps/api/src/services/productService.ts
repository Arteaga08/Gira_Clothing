import { AuditAction, AuditModule } from "@gira/shared";
import { Product, type Measurements } from "../models/Product.js";
import { ProductCategory } from "../models/ProductCategory.js";
import { Variant } from "../models/Variant.js";
import { Print } from "../models/Print.js";
import { AppError } from "../utils/AppError.js";
import { slugify, resolveUniqueSlug } from "../utils/slug.js";
import type { ImageAttrs } from "../models/schemas/image.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * Product CRUD — the only layer that touches the Product model. Deactivation
 * is a soft delete guarded by referential integrity: a product with active
 * variants cannot be retired.
 */

interface CreateProductInput {
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  weightGrams: number;
  measurements?: Measurements;
  materials?: string[];
  sizeImage?: ImageAttrs;
  bestSeller?: boolean;
  newArrival?: boolean;
  cardTags?: string[];
  cardPrint?: string | null;
}

interface UpdateProductInput {
  name?: string;
  category?: string;
  description?: string;
  basePrice?: number;
  weightGrams?: number;
  measurements?: Measurements;
  materials?: string[];
  sizeImage?: ImageAttrs | null;
  bestSeller?: boolean;
  newArrival?: boolean;
  cardTags?: string[];
  cardPrint?: string | null;
  isActive?: boolean;
}

interface PublicCategoryRef {
  id: string;
  name: string;
  slug: string;
}

interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  category: PublicCategoryRef;
  description?: string;
  basePrice: number;
  weightGrams: number;
  measurements: Measurements;
  materials: string[];
  isActive: boolean;
}

interface ProductLean {
  _id: unknown;
  name: string;
  slug: string;
  category: unknown;
  description?: string;
  basePrice: number;
  weightGrams: number;
  measurements: Measurements;
  materials: string[];
  isActive: boolean;
}

const toPublicProduct = (doc: ProductLean): PublicProduct => {
  const category = doc.category as { _id: unknown; name: string; slug: string };
  return {
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    category: { id: String(category._id), name: category.name, slug: category.slug },
    ...(doc.description ? { description: doc.description } : {}),
    basePrice: doc.basePrice,
    weightGrams: doc.weightGrams,
    measurements: doc.measurements,
    materials: doc.materials,
    isActive: doc.isActive,
  };
};

const findActiveCategoryOrThrow = async (categoryId: string) => {
  const category = await ProductCategory.findOne({ _id: categoryId, isActive: true }).lean();
  if (!category) throw new AppError("La categoría no existe.", 400);
  return category;
};

/**
 * The card print only has to exist: the editor saves the model BEFORE its
 * variants, so the variant of a print added in the same save is not there yet.
 * The public read falls back when no active variant matches.
 */
const assertCardPrintExists = async (printId: string): Promise<void> => {
  if ((await Print.exists({ _id: printId })) === null) throw new AppError("La estampa de la card no existe.", 400);
};

const createProduct = async (
  input: CreateProductInput,
  ctx: RequestContext,
): Promise<PublicProduct> => {
  const category = await findActiveCategoryOrThrow(input.category);
  if (input.cardPrint) await assertCardPrintExists(input.cardPrint);

  const slug = await resolveUniqueSlug(
    slugify(input.name),
    async (candidate) => (await Product.exists({ slug: candidate })) !== null,
  );

  // Explicit field assignment — never spread the payload (anti mass-assignment).
  const created = await Product.create({
    name: input.name,
    slug,
    category: category._id,
    description: input.description,
    basePrice: input.basePrice,
    weightGrams: input.weightGrams,
    measurements: input.measurements ?? {},
    materials: input.materials ?? [],
    sizeImage: input.sizeImage,
    bestSeller: input.bestSeller ?? false,
    newArrival: input.newArrival ?? false,
    cardTags: input.cardTags ?? [],
    ...(input.cardPrint ? { cardPrint: input.cardPrint } : {}),
  });

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRODUCT_CREATED,
    module: AuditModule.CATALOG,
    targetId: created.id as string,
    ip: ctx.ip,
  });

  return toPublicProduct({ ...created.toObject(), category });
};

const updateProduct = async (
  id: string,
  input: UpdateProductInput,
  ctx: RequestContext,
): Promise<void> => {
  const product = await Product.findById(id);
  if (!product) throw new AppError("El producto no existe.", 404);

  if (input.isActive === false && product.isActive) {
    await assertNoActiveVariants(id);
  }

  // Reactivation guard (same pattern as variantService): a product cannot go
  // back to active under a category that is itself retired. When `category`
  // also changes in this call, `findActiveCategoryOrThrow` below already
  // guarantees the new category is active, so this only checks the current one.
  if (input.isActive === true && !product.isActive && input.category === undefined) {
    const category = await ProductCategory.findById(product.category)
      .select("isActive")
      .lean();
    if (!category?.isActive) {
      throw new AppError(
        "No puedes reactivar este producto: su categoría está retirada. Reactiva primero la categoría o asígnale una categoría activa.",
        409,
      );
    }
  }

  if (input.name !== undefined && input.name !== product.name) {
    product.name = input.name;
    product.slug = await resolveUniqueSlug(
      slugify(input.name),
      async (candidate) => (await Product.exists({ slug: candidate, _id: { $ne: id } })) !== null,
    );
  }
  if (input.category !== undefined) {
    const category = await findActiveCategoryOrThrow(input.category);
    product.category = category._id;
  }
  if (input.description !== undefined) product.description = input.description;
  if (input.basePrice !== undefined) product.basePrice = input.basePrice;
  if (input.weightGrams !== undefined) product.weightGrams = input.weightGrams;
  if (input.measurements !== undefined) product.measurements = input.measurements;
  if (input.materials !== undefined) product.materials = input.materials;
  if (input.sizeImage === null) product.set("sizeImage", undefined);
  else if (input.sizeImage !== undefined) product.sizeImage = input.sizeImage;
  if (input.bestSeller !== undefined) product.bestSeller = input.bestSeller;
  if (input.newArrival !== undefined) product.newArrival = input.newArrival;
  if (input.cardTags !== undefined) product.cardTags = input.cardTags;
  if (input.cardPrint === null) product.set("cardPrint", undefined);
  else if (input.cardPrint !== undefined) {
    await assertCardPrintExists(input.cardPrint);
    product.set("cardPrint", input.cardPrint);
  }
  if (input.isActive !== undefined) product.isActive = input.isActive;

  await product.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRODUCT_UPDATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });
};

/** Throws 409 if the product still has active variants. */
const assertNoActiveVariants = async (productId: string): Promise<void> => {
  const activeChildren = await Variant.countDocuments({ product: productId, isActive: true });
  if (activeChildren > 0) {
    throw new AppError(
      "No puedes retirar un producto con variantes activas. Retira primero sus variantes.",
      409,
    );
  }
};

/** Soft delete guarded by referential integrity against active Variant children. */
const deactivateProduct = async (id: string, ctx: RequestContext): Promise<void> => {
  const product = await Product.findById(id);
  if (!product) throw new AppError("El producto no existe.", 404);

  await assertNoActiveVariants(id);

  product.isActive = false;
  await product.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRODUCT_DEACTIVATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });
};

export type { CreateProductInput, UpdateProductInput, PublicProduct };
export { createProduct, updateProduct, deactivateProduct };
