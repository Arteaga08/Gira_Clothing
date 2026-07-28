import { Schema } from "mongoose";

/**
 * Image reference produced by the upload endpoint. Stored exactly as the
 * UploadService returns it so CRUD payloads need zero transformation, and
 * `publicId` is kept so the asset can be destroyed at the provider later.
 */
interface ImageAttrs {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

const imageSchema = new Schema<ImageAttrs>(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

export type { ImageAttrs };
export { imageSchema };
