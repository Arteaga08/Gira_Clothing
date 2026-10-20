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
