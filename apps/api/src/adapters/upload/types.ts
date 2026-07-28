/**
 * Narrow, domain-owned storage interface (ARCHITECTURE, "integraciones detrás
 * de una interfaz angosta"). No Cloudinary type crosses this boundary, so a
 * second provider is a new file here and nothing else.
 */

interface UploadedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

interface UploadInput {
  buffer: Buffer;
  mimeType: string;
  /** Logical folder: "prints" | "variants". */
  folder: string;
}

interface UploadService {
  upload(input: UploadInput): Promise<UploadedImage>;
  destroy(publicId: string): Promise<void>;
}

export type { UploadedImage, UploadInput, UploadService };
