import { ApiError } from "@/lib/api/ApiError";
import { isObjectId } from "@/lib/inventory/variantId";

/** A manipulated URL or id never reaches the API: it fails here, before any request. */
const assertPrintId = (value: string): string => {
  if (!isObjectId(value)) throw new ApiError("El identificador de la estampa no es válido.", "parse");
  return value;
};

export { assertPrintId };
