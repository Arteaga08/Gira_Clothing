import { env } from "../../config/env.js";
import { createCloudinaryUploadService } from "./cloudinaryUploadService.js";
import { createStubUploadService } from "./stubUploadService.js";
import type { UploadService } from "./types.js";

let cached: UploadService | undefined;

/** Provider chosen by configuration, never by conditionals in business code. */
const getUploadService = (): UploadService => {
  cached ??= env.cloudinary
    ? createCloudinaryUploadService(env.cloudinary)
    : createStubUploadService();
  return cached;
};

export type { UploadedImage, UploadInput, UploadService } from "./types.js";
export { getUploadService };
