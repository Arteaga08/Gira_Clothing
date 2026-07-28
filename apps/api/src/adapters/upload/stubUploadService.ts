import { createHash } from "node:crypto";
import type { UploadedImage, UploadInput, UploadService } from "./types.js";

/**
 * No-network fallback used when Cloudinary credentials are absent (dev/test).
 * Deterministic: same buffer -> same publicId, so tests can assert on it.
 * width/height are 1 to satisfy the schema contract without decoding the image.
 */
const createStubUploadService = (): UploadService => ({
  upload: ({ buffer, folder }: UploadInput): Promise<UploadedImage> => {
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    return Promise.resolve({
      url: `https://stub.local/${folder}/${hash}.img`,
      publicId: `${folder}/${hash}`,
      width: 1,
      height: 1,
    });
  },
  destroy: (): Promise<void> => Promise.resolve(),
});

export { createStubUploadService };
