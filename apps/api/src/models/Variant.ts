import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { imageSchema, type ImageAttrs } from "./schemas/image.js";

/**
 * Variant = (Product + Print) — the sole owner of stock. Available =
 * onHand - reserved, never a single counter for both. `reserved` is written
 * only by M3's reservation flow; nothing in M2 touches it. Deactivation is a
 * soft delete with no referential guard — nothing sits below a variant.
 */

interface VariantAttrs {
  product: Types.ObjectId;
  print: Types.ObjectId;
  sku: string;
  images: ImageAttrs[];
  /** Overrides Product.basePrice when present. MXN centavos, integer. */
  priceOverride?: number;
  /** Physical units on hand. Written ONLY by inventoryService (Tarea 11). */
  onHand: number;
  /** Units held by in-flight orders. Written by M3 only — nothing in M2 writes it. */
  reserved: number;
  isActive: boolean;
}

type VariantModel = Model<VariantAttrs>;
type VariantDocument = HydratedDocument<VariantAttrs>;

const variantSchema = new Schema<VariantAttrs, VariantModel>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    print: { type: Schema.Types.ObjectId, ref: "Print", required: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 48 },
    images: { type: [imageSchema], default: [] },
    priceOverride: {
      type: Number,
      min: 0,
      validate: { validator: Number.isInteger, message: "El precio override debe ser un entero." },
    },
    // min: 0 here is documentation, not enforcement — Mongoose validators do not
    // run on findOneAndUpdate/$inc unless runValidators is set, and $inc bypasses
    // min regardless. The real invariant lives in inventoryService's atomic filter.
    onHand: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// One variant per (product, print) — the pair IS the identity of the variant.
// This index also serves find({ product }) as a prefix, so no extra { product: 1 }.
variantSchema.index({ product: 1, print: 1 }, { unique: true });
// Public cross-filter: "which products exist with this print?" -> distinct("product").
variantSchema.index({ print: 1, isActive: 1, product: 1 });

const Variant = model<VariantAttrs, VariantModel>("Variant", variantSchema);

export type { VariantAttrs, VariantDocument };
export { Variant };
