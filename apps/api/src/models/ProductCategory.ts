import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { CATEGORY_COLORS, CATEGORY_DEFAULT_COLOR, type CategoryColor } from "@gira/shared";

/**
 * Product taxonomy (bolsas, cosmetiqueras, fundas de laptop...). Kept as a
 * separate model from PrintFamily — different collection, different lifecycle
 * — rather than a shared generic "taxonomy" model. Deactivation is a soft
 * delete guarded by referential integrity in productCategoryService.
 */

interface ProductCategoryAttrs {
  name: string;
  slug: string;
  description?: string;
  /** Colour its storefront cards take (the team picks it in the category form). */
  color: CategoryColor;
  isActive: boolean;
}

type ProductCategoryModel = Model<ProductCategoryAttrs>;
type ProductCategoryDocument = HydratedDocument<ProductCategoryAttrs>;

const productCategorySchema = new Schema<ProductCategoryAttrs, ProductCategoryModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    color: { type: String, enum: CATEGORY_COLORS, default: CATEGORY_DEFAULT_COLOR },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Admin + public listing: filter by isActive, sort by name.
productCategorySchema.index({ isActive: 1, name: 1 });

const ProductCategory = model<ProductCategoryAttrs, ProductCategoryModel>(
  "ProductCategory",
  productCategorySchema,
);

export type { ProductCategoryAttrs, ProductCategoryDocument };
export { ProductCategory };
