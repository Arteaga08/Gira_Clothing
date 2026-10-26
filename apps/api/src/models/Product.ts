import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { PRODUCT_CARD_TAGS_MAX, PRODUCT_CARD_TAG_MAX_LENGTH } from "@gira/shared";
import { imageSchema, type ImageAttrs } from "./schemas/image.js";

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
  /** Packed weight of ONE unit, grams. Drives the shipping parcel; every size weighs about the same. */
  weightGrams: number;
  measurements: Measurements;
  materials: string[];
  /** One photo or diagram of the real size of the model. */
  sizeImage?: ImageAttrs;
  /** Flagged by the team: shows in the storefront «Más vendidos». No automatic ranking. */
  bestSeller: boolean;
  /** Flagged by the team: shows in the storefront «Novedades», newest first. */
  newArrival: boolean;
  /** Up to three words printed on the storefront card. */
  cardTags: string[];
  /** Print whose variant the card shows; unset: the first active variant with photos. */
  cardPrint?: Types.ObjectId;
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
    weightGrams: {
      type: Number,
      required: true,
      min: 1,
      max: 20_000,
      validate: { validator: Number.isInteger, message: "El peso debe ser un entero en gramos." },
    },
    measurements: { type: measurementsSchema, default: () => ({}) },
    materials: { type: [String], default: [] },
    sizeImage: { type: imageSchema },
    bestSeller: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    cardTags: {
      type: [{ type: String, trim: true, maxlength: PRODUCT_CARD_TAG_MAX_LENGTH }],
      default: [],
      validate: { validator: (tags: string[]) => tags.length <= PRODUCT_CARD_TAGS_MAX, message: "La card admite hasta 3 palabras." },
    },
    cardPrint: { type: Schema.Types.ObjectId, ref: "Print" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// The main catalog query: products of a category.
productSchema.index({ category: 1, isActive: 1, name: 1 });
// Listing without category filter.
productSchema.index({ isActive: 1, name: 1 });
// Storefront «Más vendidos»: flagged products, newest first.
productSchema.index({ isActive: 1, bestSeller: 1, createdAt: -1 });
// Storefront «Novedades»: same shape.
productSchema.index({ isActive: 1, newArrival: 1, createdAt: -1 });

const Product = model<ProductAttrs, ProductModel>("Product", productSchema);

export type { ProductAttrs, ProductDocument, Measurements };
export { Product };
