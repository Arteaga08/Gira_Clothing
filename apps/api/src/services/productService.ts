import type { ApiMeta } from "@gira/shared";
import { AuditAction, AuditModule } from "@gira/shared";
import { Product, type Measurements } from "../models/Product.js";
import { ProductCategory } from "../models/ProductCategory.js";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import { slugify, resolveUniqueSlug } from "../utils/slug.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * Product CRUD — the only layer that touches the Product model. Deactivation
 * is a soft delete guarded by referential integrity: a product with active
 * variants cannot be retired.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "basePrice", "createdAt", "updatedAt"],
  searchable: ["name"],
  defaultSort: "name",
};

interface CreateProductInput {
  name: string;
  category: string;
  description?: string;
  basePrice: number;
  measurements?: Measurements;
  materials?: string[];
}

interface UpdateProductInput {
  name?: string;
  category?: string;
  description?: string;
  basePrice?: number;
  measurements?: Measurements;
  materials?: string[];
  isActive?: boolean;
}

interface ProductListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  category?: string;
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

const createProduct = async (
  input: CreateProductInput,
  ctx: RequestContext,
): Promise<PublicProduct> => {
  const category = await findActiveCategoryOrThrow(input.category);

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
    measurements: input.measurements ?? {},
    materials: input.materials ?? [],
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

const listProducts = async (
  query: ProductListQuery,
): Promise<{ items: PublicProduct[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.category) filters.category = query.category;
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("category", "name slug")
      .lean(),
    Product.countDocuments(filter),
  ]);

  return { items: docs.map(toPublicProduct), meta: buildMeta(total, { page, limit }) };
};

const getProduct = async (id: string): Promise<PublicProduct> => {
  const doc = await Product.findById(id).populate("category", "name slug").lean();
  if (!doc) throw new AppError("El producto no existe.", 404);
  return toPublicProduct(doc);
};

const updateProduct = async (
  id: string,
  input: UpdateProductInput,
  ctx: RequestContext,
): Promise<PublicProduct> => {
  const product = await Product.findById(id);
  if (!product) throw new AppError("El producto no existe.", 404);

  if (input.isActive === false && product.isActive) {
    await assertNoActiveVariants(id);
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
  if (input.measurements !== undefined) product.measurements = input.measurements;
  if (input.materials !== undefined) product.materials = input.materials;
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

  return getProduct(id);
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
const deactivateProduct = async (id: string, ctx: RequestContext): Promise<PublicProduct> => {
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

  return getProduct(id);
};

export type { CreateProductInput, UpdateProductInput, ProductListQuery, PublicProduct };
export { createProduct, listProducts, getProduct, updateProduct, deactivateProduct };
