import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { imageSchema, type ImageAttrs } from "./schemas/image.js";

/**
 * Print — the global, reusable entity the domain revolves around. A print
 * belongs to a PrintFamily and carries its own macro photo. Deactivation is a
 * soft delete guarded by referential integrity in printService (Tarea 10,
 * once Variant exists).
 */

interface PrintAttrs {
  name: string;
  slug: string;
  sku: string;
  family: Types.ObjectId;
  /** Macro photo — a print without it is unusable in the selector. */
  image: ImageAttrs;
  isActive: boolean;
}

type PrintModel = Model<PrintAttrs>;
type PrintDocument = HydratedDocument<PrintAttrs>;

const printSchema = new Schema<PrintAttrs, PrintModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    family: { type: Schema.Types.ObjectId, ref: "PrintFamily", required: true },
    image: { type: imageSchema, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// "Prints of this family" — the spec's print-family filter.
printSchema.index({ family: 1, isActive: 1, name: 1 });
// Listing without family filter.
printSchema.index({ isActive: 1, name: 1 });

const Print = model<PrintAttrs, PrintModel>("Print", printSchema);

export type { PrintAttrs, PrintDocument };
export { Print };
