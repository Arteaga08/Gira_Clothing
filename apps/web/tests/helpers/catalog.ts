import type { AdminProduct, AdminVariant, ImageAttrs, Wire } from "@gira/shared";

const CATEGORY_ID = "68f2ab12c3d4e5f6a7b8c9e1";
const PRODUCT_ID = "68f2ab12c3d4e5f6a7b8c9e2";
const PRINT_A_ID = "68f2ab12c3d4e5f6a7b8c9e3";
const PRINT_B_ID = "68f2ab12c3d4e5f6a7b8c9e4";
const VARIANT_A_ID = "68f2ab12c3d4e5f6a7b8c9e5";
const VARIANT_B_ID = "68f2ab12c3d4e5f6a7b8c9e6";

/** Sentinels for fields the panel must never keep in the LIST model. */
const SLUG_SENTINEL = "slug-que-no-debe-llegar";
const PUBLIC_ID_SENTINEL = "gira/public-id-que-no-debe-llegar";
const DESCRIPTION_SENTINEL = "descripcion-que-no-debe-llegar";

const makeImage = (name: string, publicId = `gira/${name}`): ImageAttrs => ({
  url: `https://res.cloudinary.com/gira/${name}.jpg`,
  publicId,
  width: 800,
  height: 800,
});

const makeRawProduct = (overrides: Partial<Wire<AdminProduct>> = {}): Wire<AdminProduct> => ({
  id: PRODUCT_ID,
  name: "Cosmetiquera chica",
  slug: SLUG_SENTINEL,
  category: { id: CATEGORY_ID, name: "Cosmetiquera", slug: SLUG_SENTINEL },
  description: "Una cosmetiquera",
  basePrice: 18900,
  weightGrams: 140,
  measurements: { widthCm: 18, heightCm: 11, depthCm: 6 },
  materials: ["Lona de algodón", "forro impermeable"],
  isActive: true,
  variantCount: 3,
  activeVariantCount: 2,
  cover: makeImage("portada", PUBLIC_ID_SENTINEL),
  prints: [
    { id: PRINT_A_ID, name: "Nopal en flor", image: makeImage("nopal", PUBLIC_ID_SENTINEL) },
    { id: PRINT_B_ID, name: "Monarca", image: makeImage("monarca", PUBLIC_ID_SENTINEL) },
  ],
  updatedAt: "2026-10-20T12:00:00.000Z",
  ...overrides,
});

const makeRawVariant = (overrides: Partial<Wire<AdminVariant>> = {}): Wire<AdminVariant> => ({
  id: VARIANT_A_ID,
  sku: "COSMETIQUERA-CHICA-NOP",
  product: {
    id: PRODUCT_ID,
    name: "Cosmetiquera chica",
    slug: SLUG_SENTINEL,
    category: { id: CATEGORY_ID, name: "Cosmetiquera", slug: SLUG_SENTINEL },
  },
  print: { id: PRINT_A_ID, name: "Nopal en flor", sku: "NOP", image: makeImage("nopal") },
  onHand: 12,
  reserved: 0,
  available: 12,
  isActive: true,
  images: [makeImage("foto-1"), makeImage("foto-2")],
  updatedAt: "2026-10-20T12:00:00.000Z",
  ...overrides,
});

export {
  CATEGORY_ID,
  PRODUCT_ID,
  PRINT_A_ID,
  PRINT_B_ID,
  VARIANT_A_ID,
  VARIANT_B_ID,
  SLUG_SENTINEL,
  PUBLIC_ID_SENTINEL,
  DESCRIPTION_SENTINEL,
  makeImage,
  makeRawProduct,
  makeRawVariant,
};
