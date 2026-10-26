import type { AuditAction } from "../enums/auditAction.js";
import type { CATEGORY_COLORS } from "../constants/catalog.js";
import type { ImageAttrs } from "./order.js";

/** Colour a category gives its storefront cards (spec: M13 Más vendidos). */
type CategoryColor = (typeof CATEGORY_COLORS)[number];

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
  color: CategoryColor;
  /** Photo of the category on the storefront home; optional. */
  image?: ImageAttrs;
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
  /** Slot in the home's «Prints» section (1..PRINT_HOME_POSITION_MAX); absent = not shown there. */
  homePosition?: number;
  /** Line under the name in that section; the storefront falls back to the family description. */
  homeBlurb?: string;
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
  /** Flagged by the team in the CRUD: shows in «Más vendidos». No automatic ranking. */
  bestSeller: boolean;
  /** Flagged by the team in the CRUD: shows in «Novedades», newest first. */
  newArrival: boolean;
  /** Up to three words printed on the storefront card. */
  cardTags: string[];
  /** Print whose variant (and photos) the card shows; null/absent: the first active variant with photos. */
  cardPrintId?: string;
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

/** Storefront card of a product: the chosen variant's two photos, its price and whether it can be bought. */
interface PublicProductCard {
  variantId: string;
  /** [main, hover?]; empty when the variant has no photo (the print image is used). */
  images: ImageAttrs[];
  /** MXN centavos: `priceOverride ?? basePrice`. */
  price: number;
  isAvailable: boolean;
}

/** Product row of `GET /catalog/products`. */
interface PublicProductSummary {
  id: string;
  name: string;
  slug: string;
  category: CatalogRef & { color: CategoryColor };
  basePrice: number;
  measurements: Measurements;
  materials: string[];
  bestSeller: boolean;
  newArrival: boolean;
  cardTags: string[];
  /** Absent when the model has no purchasable variant yet. */
  card?: PublicProductCard;
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
  CategoryColor,
  PublicProductCard,
  PublicProductSummary,
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
