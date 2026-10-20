/**
 * Bounds of the catalog forms. The API validates with the same numbers
 * (productValidator / variantValidator / upload middleware); the panel
 * pre-checks with them so the operator sees the error before the request.
 */
const PRODUCT_NAME_MIN = 2;
const PRODUCT_NAME_MAX = 120;
const PRODUCT_DESCRIPTION_MAX = 2000;
/** MXN centavos. */
const PRODUCT_BASE_PRICE_MAX = 10_000_000;
const PRODUCT_WEIGHT_MIN = 1;
const PRODUCT_WEIGHT_MAX = 20_000;
const PRODUCT_MEASURE_MAX = 500;
const PRODUCT_MATERIALS_MAX = 10;
const PRODUCT_MATERIAL_MAX = 60;
const VARIANT_IMAGES_MAX = 10;
/** MXN centavos. */
const VARIANT_PRICE_OVERRIDE_MAX = 10_000_000;

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export {
  PRODUCT_NAME_MIN,
  PRODUCT_NAME_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_BASE_PRICE_MAX,
  PRODUCT_WEIGHT_MIN,
  PRODUCT_WEIGHT_MAX,
  PRODUCT_MEASURE_MAX,
  PRODUCT_MATERIALS_MAX,
  PRODUCT_MATERIAL_MAX,
  VARIANT_IMAGES_MAX,
  VARIANT_PRICE_OVERRIDE_MAX,
  UPLOAD_MAX_BYTES,
  UPLOAD_MIME_TYPES,
};
