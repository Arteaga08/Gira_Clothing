import multer from "multer";
import { UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES } from "@gira/shared";
import { AppError } from "../utils/AppError.js";

/**
 * Multipart intake for image uploads. memoryStorage: the buffer goes straight
 * to the provider, never to disk. Multipart never passes through express.json,
 * so the 10kb JSON body limit stays untouched everywhere else.
 */

const ALLOWED_MIME = new Set<string>(UPLOAD_MIME_TYPES);
const MAX_FILE_BYTES = UPLOAD_MAX_BYTES;

const uploadSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 2 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new AppError("Formato de imagen no permitido. Usa JPG, PNG, WEBP o AVIF.", 400));
      return;
    }
    cb(null, true);
  },
}).single("file");

export { uploadSingleImage };
