import { Schema, model, type HydratedDocument, type Model } from "mongoose";

/**
 * Print taxonomy (florales, rayas, lunares, cuadros...). Deactivation is a
 * soft delete guarded by referential integrity in printFamilyService — a
 * family with active prints cannot be retired.
 */

interface PrintFamilyAttrs {
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

type PrintFamilyModel = Model<PrintFamilyAttrs>;
type PrintFamilyDocument = HydratedDocument<PrintFamilyAttrs>;

const printFamilySchema = new Schema<PrintFamilyAttrs, PrintFamilyModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Admin + public listing: filter by isActive, sort by name.
printFamilySchema.index({ isActive: 1, name: 1 });

const PrintFamily = model<PrintFamilyAttrs, PrintFamilyModel>("PrintFamily", printFamilySchema);

export type { PrintFamilyAttrs, PrintFamilyDocument };
export { PrintFamily };
