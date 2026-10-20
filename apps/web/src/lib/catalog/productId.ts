import { ApiError } from "@/lib/api/ApiError";
import { isObjectId } from "@/lib/inventory/variantId";

const isProductId = (value: string): boolean => isObjectId(value);

/** A manipulated URL or id never reaches the API: it fails here, before any request. */
const assertProductId = (value: string): string => {
  if (!isProductId(value)) throw new ApiError("El identificador del modelo no es válido.", "parse");
  return value;
};

/** Panel route of one product (the id is internal; the slug never appears in the UI). */
const productPath = (id: string): string => `/productos/${assertProductId(id)}`;

export { isProductId, assertProductId, productPath };
