import { AppError } from "./AppError.js";

/**
 * Magic-byte check run BEFORE any upload reaches Cloudinary. The MIME header
 * multer trusts is client-controlled and not sufficient on its own
 * (BACKEND_SECURITY §8: validar contenido real, no solo el header declarado).
 */

const INVALID_IMAGE = "El archivo no es una imagen válida.";

const isJpeg = (buf: Buffer): boolean =>
  buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

const isPng = (buf: Buffer): boolean => {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return buf.length >= sig.length && sig.every((byte, i) => buf[i] === byte);
};

const isWebp = (buf: Buffer): boolean =>
  buf.length >= 12 &&
  buf.subarray(0, 4).toString("ascii") === "RIFF" &&
  buf.subarray(8, 12).toString("ascii") === "WEBP";

const isAvif = (buf: Buffer): boolean =>
  buf.length >= 12 &&
  buf.subarray(4, 8).toString("ascii") === "ftyp" &&
  buf.subarray(8, 12).toString("ascii") === "avif";

const CHECKS: Record<string, (buf: Buffer) => boolean> = {
  "image/jpeg": isJpeg,
  "image/png": isPng,
  "image/webp": isWebp,
  "image/avif": isAvif,
};

/** Throws AppError(400) unless `buffer` actually starts with `mimeType`'s magic bytes. */
const assertImageSignature = (buffer: Buffer, mimeType: string): void => {
  const check = CHECKS[mimeType];
  if (!check || !check(buffer)) {
    throw new AppError(INVALID_IMAGE, 400);
  }
};

export { assertImageSignature };
