import type { ApiMeta } from "@gira/shared";
import type { Types } from "mongoose";
import { PrintFamily } from "../models/PrintFamily.js";
import { Print } from "../models/Print.js";
import { ProductCategory } from "../models/ProductCategory.js";
import { Product, type Measurements } from "../models/Product.js";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";
import type { ImageAttrs } from "../models/schemas/image.js";

/**
 * Public, read-only catalog queries. Every query is scoped to isActive:true —
 * visitors never see paused/retired documents, and public DTOs never expose
 * onHand/reserved (only the derived `available`).
 */

interface RawPublicQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
}

// --- Families --------------------------------------------------------------

const FAMILY_LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "createdAt"],
  searchable: ["name"],
  defaultSort: "name",
};

interface PublicFamily {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface FamilyLean {
  _id: unknown;
  name: string;
  slug: string;
  description?: string;
}

const toPublicFamily = (doc: FamilyLean): PublicFamily => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  ...(doc.description ? { description: doc.description } : {}),
});

const listPublicFamilies = async (
  query: RawPublicQuery,
): Promise<{ items: PublicFamily[]; meta: ApiMeta }> => {
  const { filter, sort, skip, limit, page } = parseListQuery(query, FAMILY_LIST_CONFIG, {
    isActive: true,
  });
  const [docs, total] = await Promise.all([
    PrintFamily.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    PrintFamily.countDocuments(filter),
  ]);
  return { items: docs.map(toPublicFamily), meta: buildMeta(total, { page, limit }) };
};

const getPublicFamily = async (slug: string): Promise<PublicFamily> => {
  const doc = await PrintFamily.findOne({ slug, isActive: true }).lean();
  if (!doc) throw new AppError("La familia de estampados no existe.", 404);
  return toPublicFamily(doc);
};

// --- Prints ------------------------------------------------------------

const PRINT_LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "createdAt"],
  searchable: ["name", "sku"],
  defaultSort: "name",
};

interface PublicPrint {
  id: string;
  name: string;
  slug: string;
  sku: string;
  family: { id: string; name: string; slug: string };
  image: ImageAttrs;
}

interface PrintLean {
  _id: unknown;
  name: string;
  slug: string;
  sku: string;
  family: unknown;
  image: ImageAttrs;
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
  };
};

const listPublicPrints = async (
  query: RawPublicQuery & { family?: string },
): Promise<{ items: PublicPrint[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = { isActive: true };
  if (query.family) {
    const family = await PrintFamily.findOne({ slug: query.family, isActive: true })
      .select("_id")
      .lean();
    if (!family) throw new AppError("La familia de estampados no existe.", 404);
    filters.family = family._id;
  }

  const { filter, sort, skip, limit, page } = parseListQuery(query, PRINT_LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    Print.find(filter).sort(sort).skip(skip).limit(limit).populate("family", "name slug").lean(),
    Print.countDocuments(filter),
  ]);
  return { items: docs.map(toPublicPrint), meta: buildMeta(total, { page, limit }) };
};

const getPublicPrint = async (slug: string): Promise<PublicPrint> => {
  const doc = await Print.findOne({ slug, isActive: true }).populate("family", "name slug").lean();
  if (!doc) throw new AppError("El estampado no existe.", 404);
  return toPublicPrint(doc);
};

// --- Categories --------------------------------------------------------

const CATEGORY_LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "createdAt"],
  searchable: ["name"],
  defaultSort: "name",
};

interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface CategoryLean {
  _id: unknown;
  name: string;
  slug: string;
  description?: string;
}

const toPublicCategory = (doc: CategoryLean): PublicCategory => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  ...(doc.description ? { description: doc.description } : {}),
});

const listPublicCategories = async (
  query: RawPublicQuery,
): Promise<{ items: PublicCategory[]; meta: ApiMeta }> => {
  const { filter, sort, skip, limit, page } = parseListQuery(query, CATEGORY_LIST_CONFIG, {
    isActive: true,
  });
  const [docs, total] = await Promise.all([
    ProductCategory.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ProductCategory.countDocuments(filter),
  ]);
  return { items: docs.map(toPublicCategory), meta: buildMeta(total, { page, limit }) };
};

// --- Products (cross-filtered by print / family) ------------------------

const PRODUCT_LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "basePrice", "createdAt"],
  searchable: ["name"],
  defaultSort: "name",
};

interface PublicProductSummary {
  id: string;
  name: string;
  slug: string;
  category: { id: string; name: string; slug: string };
  basePrice: number;
  measurements: Measurements;
  materials: string[];
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
}

const toPublicProductSummary = (doc: ProductLean): PublicProductSummary => {
  const category = doc.category as { _id: unknown; name: string; slug: string };
  return {
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    category: { id: String(category._id), name: category.name, slug: category.slug },
    basePrice: doc.basePrice,
    measurements: doc.measurements,
    materials: doc.materials,
  };
};

interface PublicProductQuery extends RawPublicQuery {
  category?: string;
  print?: string;
  family?: string;
}

/**
 * Product <-> Print is N:M through Variant. Chosen implementation: two-step
 * query, not an aggregation — pagination/meta stay over Product with the
 * existing parseListQuery/buildMeta path, and the print/family resolution is
 * served entirely by the { print, isActive, product } index (index-only
 * distinct, no document fetch). Revisit with a $lookup+$facet aggregation
 * only if the matching-product set grows into the thousands.
 */
const listPublicProducts = async (
  query: PublicProductQuery,
): Promise<{ items: PublicProductSummary[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = { isActive: true };

  if (query.category) {
    const category = await ProductCategory.findOne({ slug: query.category, isActive: true })
      .select("_id")
      .lean();
    if (!category) throw new AppError("La categoría no existe.", 404);
    filters.category = category._id;
  }

  let printIds: Types.ObjectId[] | null = null;
  if (query.print) {
    const print = await Print.findOne({ slug: query.print, isActive: true }).select("_id").lean();
    if (!print) throw new AppError("El estampado no existe.", 404);
    printIds = [print._id];
  } else if (query.family) {
    const family = await PrintFamily.findOne({ slug: query.family, isActive: true })
      .select("_id")
      .lean();
    if (!family) throw new AppError("La familia de estampados no existe.", 404);
    printIds = await Print.distinct("_id", { family: family._id, isActive: true });
  }

  if (printIds !== null) {
    const productIds =
      printIds.length === 0
        ? []
        : await Variant.distinct("product", { print: { $in: printIds }, isActive: true });
    if (productIds.length === 0) {
      const empty = parseListQuery(query, PRODUCT_LIST_CONFIG, filters);
      return { items: [], meta: buildMeta(0, { page: empty.page, limit: empty.limit }) };
    }
    filters._id = { $in: productIds };
  }

  const { filter, sort, skip, limit, page } = parseListQuery(query, PRODUCT_LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).populate("category", "name slug").lean(),
    Product.countDocuments(filter),
  ]);
  return { items: docs.map(toPublicProductSummary), meta: buildMeta(total, { page, limit }) };
};

interface PublicVariantView {
  id: string;
  sku: string;
  images: ImageAttrs[];
  priceOverride?: number;
  available: number;
  print: { id: string; name: string; slug: string; sku: string; image: ImageAttrs };
}

interface PublicProductDetail extends PublicProductSummary {
  description?: string;
  variants: PublicVariantView[];
}

interface VariantWithPrintLean {
  _id: unknown;
  sku: string;
  images: ImageAttrs[];
  priceOverride?: number;
  onHand: number;
  reserved: number;
  print: { _id: unknown; name: string; slug: string; sku: string; image: ImageAttrs; isActive: boolean };
}

const getPublicProduct = async (slug: string): Promise<PublicProductDetail> => {
  const product = await Product.findOne({ slug, isActive: true })
    .populate("category", "name slug")
    .lean();
  if (!product) throw new AppError("El producto no existe.", 404);

  const variantDocs = (await Variant.find({ product: product._id, isActive: true })
    .populate("print", "name slug sku image isActive")
    .lean()) as unknown as VariantWithPrintLean[];

  // A variant can stay active while its print gets retired independently —
  // exclude those from the public detail even though the variant itself is active.
  const variants: PublicVariantView[] = variantDocs
    .filter((v) => v.print.isActive)
    .map((v) => ({
      id: String(v._id),
      sku: v.sku,
      images: v.images,
      ...(v.priceOverride !== undefined ? { priceOverride: v.priceOverride } : {}),
      available: v.onHand - v.reserved,
      print: {
        id: String(v.print._id),
        name: v.print.name,
        slug: v.print.slug,
        sku: v.print.sku,
        image: v.print.image,
      },
    }));

  return { ...toPublicProductSummary(product), variants };
};

export type {
  PublicFamily,
  PublicPrint,
  PublicCategory,
  PublicProductSummary,
  PublicProductDetail,
  PublicVariantView,
};
export {
  listPublicFamilies,
  getPublicFamily,
  listPublicPrints,
  getPublicPrint,
  listPublicCategories,
  listPublicProducts,
  getPublicProduct,
};
