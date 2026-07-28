import type { ApiMeta } from "@gira/shared";
import { AuditAction, AuditModule } from "@gira/shared";
import { ProductCategory } from "../models/ProductCategory.js";
import { Product } from "../models/Product.js";
import { AppError } from "../utils/AppError.js";
import { slugify, resolveUniqueSlug } from "../utils/slug.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * ProductCategory CRUD — the only layer that touches the ProductCategory model.
 * Deactivation is a soft delete guarded by referential integrity: a category
 * with active products cannot be retired. Same guard runs on PATCH { isActive: false }.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "createdAt", "updatedAt"],
  searchable: ["name"],
  defaultSort: "name",
};

interface CreateProductCategoryInput {
  name: string;
  description?: string;
}

interface UpdateProductCategoryInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

interface ProductCategoryListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  isActive?: boolean;
}

interface PublicProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

interface ProductCategoryLean {
  _id: unknown;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

// .lean() docs have no `id` virtual — map _id explicitly.
const toPublicProductCategory = (doc: ProductCategoryLean): PublicProductCategory => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  ...(doc.description ? { description: doc.description } : {}),
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

const listProductCategories = async (
  query: ProductCategoryListQuery,
): Promise<{ items: PublicProductCategory[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    ProductCategory.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ProductCategory.countDocuments(filter),
  ]);

  return { items: docs.map(toPublicProductCategory), meta: buildMeta(total, { page, limit }) };
};

const getProductCategory = async (id: string): Promise<PublicProductCategory> => {
  const category = await ProductCategory.findById(id).lean();
  if (!category) throw new AppError("La categoría no existe.", 404);
  return toPublicProductCategory(category);
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
  ProductCategoryListQuery,
  PublicProductCategory,
};
export {
  createProductCategory,
  listProductCategories,
  getProductCategory,
  updateProductCategory,
  deactivateProductCategory,
};
