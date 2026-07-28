import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

/**
 * Product — a model/silhouette (Tote, Curvy, Bárbara, Ruffles, Mini) belonging
 * to a ProductCategory. Carries a base price in MXN; it has no stock of its
 * own — that lives exclusively on Variant. Deactivation is a soft delete
 * guarded by referential integrity in productService (Tarea 10, once
 * Variant exists).
 */

interface Measurements {
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
}

interface ProductAttrs {
  name: string;
  slug: string;
  category: Types.ObjectId;
  description?: string;
  /** Base price in MXN centavos (integer). Money in floats drifts, and M3 snapshots this value. */
  basePrice: number;
  measurements: Measurements;
  materials: string[];
  isActive: boolean;
}

type ProductModel = Model<ProductAttrs>;
type ProductDocument = HydratedDocument<ProductAttrs>;

const measurementsSchema = new Schema<Measurements>(
  {
    widthCm: { type: Number, min: 0, max: 500 },
    heightCm: { type: Number, min: 0, max: 500 },
    depthCm: { type: Number, min: 0, max: 500 },
  },
  { _id: false },
);

const productSchema = new Schema<ProductAttrs, ProductModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: "ProductCategory", required: true },
    description: { type: String, trim: true, maxlength: 2000 },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: "El precio base debe ser un entero." },
    },
    measurements: { type: measurementsSchema, default: () => ({}) },
    materials: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// The main catalog query: products of a category.
productSchema.index({ category: 1, isActive: 1, name: 1 });
// Listing without category filter.
productSchema.index({ isActive: 1, name: 1 });

const Product = model<ProductAttrs, ProductModel>("Product", productSchema);

export type { ProductAttrs, ProductDocument, Measurements };
export { Product };
