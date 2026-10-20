import type { AdminVariant, Wire } from "@gira/shared";

/**
 * A variant as the panel holds it. The admin DTO also carries slugs, the print
 * SKU and the image's storage ids: the UI paints none of them, so they are cut
 * at the HTTP boundary and never reach component props, React state or the RSC
 * payload serialized into the page.
 */
interface PanelVariant {
  id: string;
  sku: string;
  product: { id: string; name: string; category: { id: string; name: string } };
  print: { id: string; name: string; image: { url: string } };
  /** MXN centavos. */
  priceOverride?: number;
  onHand: number;
  reserved: number;
  available: number;
  isActive: boolean;
  updatedAt: string;
}

const toPanelVariant = (variant: Wire<AdminVariant>): PanelVariant => ({
  id: variant.id,
  sku: variant.sku,
  product: {
    id: variant.product.id,
    name: variant.product.name,
    category: { id: variant.product.category.id, name: variant.product.category.name },
  },
  print: { id: variant.print.id, name: variant.print.name, image: { url: variant.print.image.url } },
  ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
  onHand: variant.onHand,
  reserved: variant.reserved,
  available: variant.available,
  isActive: variant.isActive,
  updatedAt: variant.updatedAt,
});

export { toPanelVariant };
export type { PanelVariant };
