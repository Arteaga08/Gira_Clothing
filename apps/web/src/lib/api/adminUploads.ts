import type { ImageAttrs } from "@gira/shared";
import { browserRequest } from "./browser";
import { ADMIN_UPLOADS_PATH } from "./paths";
import { expectData } from "./request";

type UploadFolder = "prints" | "variants" | "products" | "home" | "categories";

/** Generous: the API streams the file to Cloudinary before it answers. */
const UPLOAD_TIMEOUT_MS = 30_000;

/**
 * Uploads one image and answers the object the catalog stores as-is
 * (`{ url, publicId, width, height }`). The text field goes before the file so
 * the multipart parser has `folder` by the time the file arrives.
 */
const uploadImage = async (file: File, folder: UploadFolder): Promise<ImageAttrs> => {
  const form = new FormData();
  form.append("folder", folder);
  form.append("file", file);
  return expectData(
    await browserRequest<{ image: ImageAttrs }>(ADMIN_UPLOADS_PATH, { method: "POST", body: form, timeoutMs: UPLOAD_TIMEOUT_MS }),
  ).image;
};

export { uploadImage };
export type { UploadFolder };
