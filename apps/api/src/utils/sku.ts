/** Uppercase, ASCII-only, dash-separated SKU token. */
const normalizeSku = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Deterministic `<PRODUCT-TOKEN>-<PRINT-SKU>`, capped at Variant.sku maxlength.
 * Derived ONCE at creation and never recomputed: a SKU that changes when someone
 * fixes a typo in the product name breaks printed labels and M3 order snapshots.
 */
const buildVariantSku = (productSlug: string, printSku: string): string =>
  `${normalizeSku(productSlug).slice(0, 24)}-${normalizeSku(printSku)}`
    .slice(0, 48)
    .replace(/-+$/, "");

export { normalizeSku, buildVariantSku };
