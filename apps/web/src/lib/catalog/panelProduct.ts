import type { AdminProduct, Wire } from "@gira/shared";

/**
 * A product as the LIST holds it. The admin DTO also carries slugs, the
 * description, weight, measurements and the images' storage ids: the cards
 * paint none of them, so they are cut at the HTTP boundary and never reach
 * component props, React state or the RSC payload.
 */
interface PanelProduct {
  id: string;
  name: string;
  category: { id: string; name: string };
  /** MXN centavos. */
  basePrice: number;
  isActive: boolean;
  variantCount: number;
  activeVariantCount: number;
  cover?: { url: string };
  /** Up to 5 active prints, for the thumbnails on the card. */
  prints: { id: string; name: string; image: { url: string } }[];
  updatedAt: string;
}

const toPanelProduct = (product: Wire<AdminProduct>): PanelProduct => ({
  id: product.id,
  name: product.name,
  category: { id: product.category.id, name: product.category.name },
  basePrice: product.basePrice,
  isActive: product.isActive,
  variantCount: product.variantCount,
  activeVariantCount: product.activeVariantCount,
  ...(product.cover ? { cover: { url: product.cover.url } } : {}),
  prints: product.prints.map((print) => ({ id: print.id, name: print.name, image: { url: print.image.url } })),
  updatedAt: product.updatedAt,
});

export { toPanelProduct };
export type { PanelProduct };
