import type { AuditAction } from "../enums/auditAction.js";
import type { ImageAttrs } from "./order.js";

/** Populated reference the catalog API returns in place of a bare id. */
interface CatalogRef {
  id: string;
  name: string;
  slug: string;
}

interface PrintFamily {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

interface Print {
  id: string;
  name: string;
  slug: string;
  sku: string;
  family: CatalogRef;
  image: ImageAttrs;
  isActive: boolean;
}

interface Measurements {
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  category: CatalogRef;
  description?: string;
  basePrice: number;
  /** Packed weight of one unit, grams (drives the shipping parcel). */
  weightGrams: number;
  measurements?: Measurements;
  materials?: string[];
  /** One photo (or diagram) that shows the real size of the model. Optional, one per model. */
  sizeImage?: ImageAttrs;
  isActive: boolean;
}

interface Variant {
  id: string;
  product: string;
  print: string;
  sku: string;
  images: ImageAttrs[];
  priceOverride?: number;
  onHand: number;
  reserved: number;
  /** Computed: onHand - reserved. Never stored. */
  available: number;
  isActive: boolean;
}

/** Storefront view of a variant: a signal, never the stock figures. */
interface PublicVariant {
  id: string;
  sku: string;
  images: ImageAttrs[];
  priceOverride?: number;
  isAvailable: boolean;
}

/** Admin inventory row: one Variant (Product × Print) with its names resolved. */
interface AdminVariant {
  id: string;
  sku: string;
  product: { id: string; name: string; slug: string; category: CatalogRef };
  print: { id: string; name: string; sku: string; image: ImageAttrs };
  /** MXN centavos. */
  priceOverride?: number;
  onHand: number;
  reserved: number;
  /** onHand - reserved. */
  available: number;
  isActive: boolean;
  /** Present only on single-variant catalog reads and on `?withImages=true` lists. */
  images?: ImageAttrs[];
  updatedAt: Date;
}

/** A print shown as a thumbnail on a product card. */
interface AdminProductPrint {
  id: string;
  name: string;
  image: ImageAttrs;
}

/** Admin catalog row/detail: a model with its category and a summary of its variants. */
interface AdminProduct extends Product {
  measurements: Measurements;
  materials: string[];
  variantCount: number;
  activeVariantCount: number;
  /** First photo of an active variant, else the first active print's image, else the size photo. */
  cover?: ImageAttrs;
  /** Up to 5 active prints, in creation order. */
  prints: AdminProductPrint[];
  updatedAt: Date;
}

/** A model that still has an active variant of a print: the retire guard names them. */
interface AdminPrintProduct {
  id: string;
  name: string;
}

/** Admin catalog row/detail: a print with how much of the catalog uses it. */
interface AdminPrint extends Print {
  /** Every variant of this print, retired or not. */
  variantCount: number;
  activeVariantCount: number;
  /** Models with an active variant of this print, A-Z, at most 10 (one variant per model, so `activeVariantCount` is the true total). */
  activeProducts: AdminPrintProduct[];
  updatedAt: Date;
}

/** A child record (print or model) that still uses a family or category: the retire guard names them. */
interface AdminTaxonChild {
  id: string;
  name: string;
}

/** Admin catalog row/detail: a print family with how many prints it holds. */
interface AdminPrintFamily extends PrintFamily {
  /** Every print of the family, retired or not. */
  printCount: number;
  activePrintCount: number;
  /** Active prints, A-Z, at most 10 (`activePrintCount` is the true total). */
  activePrints: AdminTaxonChild[];
  updatedAt: Date;
}

/** Admin catalog row/detail: a product category with how many models it holds. */
interface AdminProductCategory extends ProductCategory {
  /** Every model of the category, retired or not. */
  productCount: number;
  activeProductCount: number;
  /** Active models, A-Z, at most 10 (`activeProductCount` is the true total). */
  activeProducts: AdminTaxonChild[];
  updatedAt: Date;
}

/** One stock movement from the audit trail (STOCK_SET / STOCK_ADJUSTED). */
interface AdminVariantActivity {
  id: string;
  action: AuditAction;
  createdAt: Date;
  actorName: string;
  before?: number;
  after?: number;
  /** after - before. */
  delta?: number;
  reason?: string;
}

export type {
  CatalogRef,
  AdminProduct,
  AdminProductPrint,
  AdminPrint,
  AdminPrintProduct,
  AdminTaxonChild,
  AdminPrintFamily,
  AdminProductCategory,
  AdminVariant,
  AdminVariantActivity,
  PrintFamily,
  ProductCategory,
  Print,
  Measurements,
  Product,
  Variant,
  PublicVariant,
};
