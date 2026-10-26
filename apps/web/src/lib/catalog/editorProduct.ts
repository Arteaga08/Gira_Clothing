import type { AdminProduct, AdminVariant, ImageAttrs, Measurements, Wire } from "@gira/shared";

/**
 * The product as the EDITOR holds it. `sizeImage` keeps its `publicId` only to
 * tell whether the operator replaced it; it is never rendered.
 */
interface EditorProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string;
  /** MXN centavos. */
  basePrice: number;
  weightGrams: number;
  measurements: Measurements;
  materials: string[];
  sizeImage?: ImageAttrs;
  bestSeller: boolean;
  newArrival: boolean;
  cardTags: string[];
  /** "" while the card follows the automatic variant. */
  cardPrintId: string;
  isActive: boolean;
  activeVariantCount: number;
}

/**
 * A variant of the product as the editor holds it. Unlike the Inventory panel,
 * the images keep their `publicId`/size: PATCH replaces the whole array, so the
 * photos the operator did not touch must travel back intact.
 */
interface ExistingVariant {
  id: string;
  printId: string;
  sku: string;
  isActive: boolean;
  /** MXN centavos. */
  priceOverride?: number;
  images: ImageAttrs[];
  onHand: number;
  reserved: number;
}

const toEditorProduct = (product: Wire<AdminProduct>): EditorProduct => ({
  id: product.id,
  name: product.name,
  categoryId: product.category.id,
  categoryName: product.category.name,
  description: product.description ?? "",
  basePrice: product.basePrice,
  weightGrams: product.weightGrams,
  measurements: product.measurements,
  materials: product.materials,
  ...(product.sizeImage ? { sizeImage: product.sizeImage } : {}),
  bestSeller: product.bestSeller,
  newArrival: product.newArrival,
  cardTags: product.cardTags,
  cardPrintId: product.cardPrintId ?? "",
  isActive: product.isActive,
  activeVariantCount: product.activeVariantCount,
});

const toExistingVariant = (variant: Wire<AdminVariant>): ExistingVariant => ({
  id: variant.id,
  printId: variant.print.id,
  sku: variant.sku,
  isActive: variant.isActive,
  ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
  images: variant.images ?? [],
  onHand: variant.onHand,
  reserved: variant.reserved,
});

export { toEditorProduct, toExistingVariant };
export type { EditorProduct, ExistingVariant };
