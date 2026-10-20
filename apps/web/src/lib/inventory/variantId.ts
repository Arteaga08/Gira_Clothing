import { ApiError } from "@/lib/api/ApiError";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const isObjectId = (value: string): boolean => OBJECT_ID_PATTERN.test(value);
const isVariantId = (value: string): boolean => isObjectId(value);

/** A manipulated URL or id never reaches the API: it fails here, before any request. */
const assertVariantId = (value: string): string => {
  if (!isVariantId(value)) throw new ApiError("El identificador de la variante no es válido.", "parse");
  return value;
};

export { isObjectId, isVariantId, assertVariantId };
