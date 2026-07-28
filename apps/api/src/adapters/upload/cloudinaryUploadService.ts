import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import type { CloudinaryConfig } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { logger } from "../../config/logger.js";
import type { UploadedImage, UploadInput, UploadService } from "./types.js";

/** Cloudinary implementation of UploadService. Never imported outside adapters/. */
const createCloudinaryUploadService = (cfg: CloudinaryConfig): UploadService => {
  cloudinary.config({
    cloud_name: cfg.cloudName,
    api_key: cfg.apiKey,
    api_secret: cfg.apiSecret,
    secure: true,
  });

  const upload = ({ buffer, folder }: UploadInput): Promise<UploadedImage> =>
    new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${cfg.folder}/${folder}`,
          resource_type: "image",
          // Strip EXIF/metadata before it ever lands at the provider.
          image_metadata: false,
          invalidate: true,
        },
        (err: unknown, result?: UploadApiResponse) => {
          if (err || !result) {
            logger.error({ err }, "Cloudinary upload failed");
            reject(new AppError("No se pudo subir la imagen. Intenta de nuevo.", 502));
            return;
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
          });
        },
      );
      stream.end(buffer);
    });

  const destroy = async (publicId: string): Promise<void> => {
    await cloudinary.uploader.destroy(publicId);
  };

  return { upload, destroy };
};

export { createCloudinaryUploadService };
