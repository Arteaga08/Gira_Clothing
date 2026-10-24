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

const PRINT_NAME_MIN = 2;
const PRINT_NAME_MAX = 80;
const PRINT_SKU_MIN = 2;
const PRINT_SKU_MAX = 24;
/** Uppercase letters, digits and hyphens: the print SKU feeds every variant SKU. */
const PRINT_SKU_PATTERN = /^[A-Z0-9-]+$/;

const PRINT_FAMILY_NAME_MIN = 2;
const PRINT_FAMILY_NAME_MAX = 80;
const PRINT_FAMILY_DESCRIPTION_MAX = 500;
const PRODUCT_CATEGORY_NAME_MIN = 2;
const PRODUCT_CATEGORY_NAME_MAX = 80;
const PRODUCT_CATEGORY_DESCRIPTION_MAX = 500;


/** Colours a category may carry; its best-seller cards take it. Text on top is always ink; yellow is never one (CTA only). */
const CATEGORY_COLORS = ["bone", "pink", "lilac", "mint", "ikat", "tangerine", "cherry", "sky"] as const;
const CATEGORY_DEFAULT_COLOR = "bone";

/** The three words printed on a product's storefront card. */
const PRODUCT_CARD_TAGS_MAX = 3;
const PRODUCT_CARD_TAG_MAX_LENGTH = 20;

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
  PRINT_NAME_MIN,
  PRINT_NAME_MAX,
  PRINT_SKU_MIN,
  PRINT_SKU_MAX,
  PRINT_SKU_PATTERN,
  PRINT_FAMILY_NAME_MIN,
  PRINT_FAMILY_NAME_MAX,
  PRINT_FAMILY_DESCRIPTION_MAX,
  PRODUCT_CATEGORY_NAME_MIN,
  PRODUCT_CATEGORY_NAME_MAX,
  PRODUCT_CATEGORY_DESCRIPTION_MAX,
  CATEGORY_COLORS,
  CATEGORY_DEFAULT_COLOR,
  PRODUCT_CARD_TAGS_MAX,
  PRODUCT_CARD_TAG_MAX_LENGTH,
  UPLOAD_MAX_BYTES,
  UPLOAD_MIME_TYPES,
};
