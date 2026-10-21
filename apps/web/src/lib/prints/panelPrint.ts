import type { AdminPrint, Wire } from "@gira/shared";

/**
 * A print as the list and the side panel hold it. The admin DTO also carries
 * the slug and the image's storage id: nothing paints them, so they are cut at
 * the HTTP boundary and never reach component props or React state.
 */
interface PanelPrint {
  id: string;
  name: string;
  sku: string;
  family: { id: string; name: string };
  imageUrl: string;
  isActive: boolean;
  variantCount: number;
  activeVariantCount: number;
  /** At most 10; `activeVariantCount` is the true total. */
  activeProducts: { id: string; name: string }[];
}

const toPanelPrint = (print: Wire<AdminPrint>): PanelPrint => ({
  id: print.id,
  name: print.name,
  sku: print.sku,
  family: { id: print.family.id, name: print.family.name },
  imageUrl: print.image.url,
  isActive: print.isActive,
  variantCount: print.variantCount,
  activeVariantCount: print.activeVariantCount,
  activeProducts: print.activeProducts.map((product) => ({ id: product.id, name: product.name })),
});

export { toPanelPrint };
export type { PanelPrint };
