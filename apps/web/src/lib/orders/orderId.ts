import { ApiError } from "@/lib/api/ApiError";

const ORDER_ID_PATTERN = /^[a-f\d]{24}$/i;

const isOrderId = (value: string): boolean => ORDER_ID_PATTERN.test(value);

/** A manipulated URL or id never reaches the API: it fails here, before any request. */
const assertOrderId = (value: string): string => {
  if (!isOrderId(value)) throw new ApiError("El identificador del pedido no es válido.", "parse");
  return value;
};

export { isOrderId, assertOrderId };
