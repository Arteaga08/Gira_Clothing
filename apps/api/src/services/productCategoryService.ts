import { AuditAction, AuditModule, CATEGORY_DEFAULT_COLOR, type CategoryColor } from "@gira/shared";
import { ProductCategory } from "../models/ProductCategory.js";
import { Product } from "../models/Product.js";
import { AppError } from "../utils/AppError.js";
import { slugify, resolveUniqueSlug } from "../utils/slug.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * ProductCategory CRUD — the only layer that touches the ProductCategory model.
 * Deactivation is a soft delete guarded by referential integrity: a category
 * with active products cannot be retired. Same guard runs on PATCH { isActive: false }.
 */

interface CreateProductCategoryInput {
  name: string;
  description?: string;
  color?: CategoryColor;
}

interface UpdateProductCategoryInput {
  name?: string;
  description?: string;
  color?: CategoryColor;
  isActive?: boolean;
}

interface PublicProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color: CategoryColor;
  isActive: boolean;
}

interface ProductCategoryLean {
  _id: unknown;
  name: string;
  slug: string;
  description?: string;
  color?: CategoryColor;
  isActive: boolean;
}

// .lean() docs have no `id` virtual — map _id explicitly.
const toPublicProductCategory = (doc: ProductCategoryLean): PublicProductCategory => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  ...(doc.description ? { description: doc.description } : {}),
  color: doc.color ?? CATEGORY_DEFAULT_COLOR,
  isActive: doc.isActive,
});

const createProductCategory = async (
  input: CreateProductCategoryInput,
  ctx: RequestContext,
): Promise<PublicProductCategory> => {
  const slug = await resolveUniqueSlug(
    slugify(input.name),
    async (candidate) => (await ProductCategory.exists({ slug: candidate })) !== null,
  );

  // Explicit field assignment — never spread the payload (anti mass-assignment).
  const created = await ProductCategory.create({
    name: input.name,
    slug,
    description: input.description,
    color: input.color ?? CATEGORY_DEFAULT_COLOR,
  });

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRODUCT_CATEGORY_CREATED,
    module: AuditModule.CATALOG,
    targetId: created.id as string,
    ip: ctx.ip,
  });

  return toPublicProductCategory(created.toObject());
};

/** Throws 409 if the category still has active products. */
const assertNoActiveProducts = async (categoryId: string): Promise<void> => {
  const activeChildren = await Product.countDocuments({ category: categoryId, isActive: true });
  if (activeChildren > 0) {
    throw new AppError(
      "No puedes retirar una categoría con productos activos. Retira primero sus productos.",
      409,
    );
  }
};

const updateProductCategory = async (
  id: string,
  input: UpdateProductCategoryInput,
  ctx: RequestContext,
): Promise<PublicProductCategory> => {
  const category = await ProductCategory.findById(id);
  if (!category) throw new AppError("La categoría no existe.", 404);

  if (input.isActive === false && category.isActive) {
    await assertNoActiveProducts(id);
  }

  if (input.name !== undefined && input.name !== category.name) {
    category.name = input.name;
    category.slug = await resolveUniqueSlug(
      slugify(input.name),
      async (candidate) =>
        (await ProductCategory.exists({ slug: candidate, _id: { $ne: id } })) !== null,
    );
  }
  if (input.description !== undefined) category.description = input.description;
  if (input.color !== undefined) category.color = input.color;
  if (input.isActive !== undefined) category.isActive = input.isActive;

  await category.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRODUCT_CATEGORY_UPDATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });

  return toPublicProductCategory(category.toObject());
};

/** Soft delete guarded by referential integrity against active Product children. */
const deactivateProductCategory = async (
  id: string,
  ctx: RequestContext,
): Promise<PublicProductCategory> => {
  const category = await ProductCategory.findById(id);
  if (!category) throw new AppError("La categoría no existe.", 404);

  await assertNoActiveProducts(id);

  category.isActive = false;
  await category.save();

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRODUCT_CATEGORY_DEACTIVATED,
    module: AuditModule.CATALOG,
    targetId: id,
    ip: ctx.ip,
  });

  return toPublicProductCategory(category.toObject());
};

export type {
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
  PublicProductCategory,
};
export {
  createProductCategory,
  updateProductCategory,
  deactivateProductCategory,
};
