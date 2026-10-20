import type { AdminVariant, Wire } from "@gira/shared";

const CATEGORY_ID = "68f2ab12c3d4e5f6a7b8c9d1";
const VARIANT_ID = "68f2ab12c3d4e5f6a7b8c9d2";

/** Sentinels for fields the panel must never keep. */
const SLUG_SENTINEL = "slug-que-no-debe-llegar";
const PRINT_SKU_SENTINEL = "sku-de-print-que-no-debe-llegar";
const IMAGE_PUBLIC_ID_SENTINEL = "gira/public-id-que-no-debe-llegar";

const makeRawVariant = (overrides: Partial<Wire<AdminVariant>> = {}): Wire<AdminVariant> => ({
  id: VARIANT_ID,
  sku: "HOOD-BRUMA",
  product: {
    id: "68f2ab12c3d4e5f6a7b8c9d3",
    name: "Hoodie Oversize",
    slug: SLUG_SENTINEL,
    category: { id: CATEGORY_ID, name: "Hoodies", slug: SLUG_SENTINEL },
  },
  print: {
    id: "68f2ab12c3d4e5f6a7b8c9d4",
    name: "Bruma",
    sku: PRINT_SKU_SENTINEL,
    image: { url: "https://res.cloudinary.com/gira/bruma.jpg", publicId: IMAGE_PUBLIC_ID_SENTINEL, width: 800, height: 600 },
  },
  onHand: 10,
  reserved: 2,
  available: 8,
  isActive: true,
  updatedAt: "2026-10-20T12:00:00.000Z",
  ...overrides,
});

export { makeRawVariant, PRINT_SKU_SENTINEL, CATEGORY_ID, VARIANT_ID, SLUG_SENTINEL, IMAGE_PUBLIC_ID_SENTINEL };
