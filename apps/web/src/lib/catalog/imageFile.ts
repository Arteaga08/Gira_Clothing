import { UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES } from "@gira/shared";

/** Value for an `<input type="file" accept>`. */
const IMAGE_ACCEPT = UPLOAD_MIME_TYPES.join(",");

/** Pre-checks what the API enforces (type and 5 MB), so the operator sees the problem before the upload. `null` = fine. */
const validateImageFile = (file: File): string | null => {
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `«${file.name}» no es una imagen válida. Usa JPG, PNG, WEBP o AVIF.`;
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return `«${file.name}» pesa más de ${UPLOAD_MAX_BYTES / 1024 / 1024} MB.`;
  }
  return null;
};

export { IMAGE_ACCEPT, validateImageFile };
