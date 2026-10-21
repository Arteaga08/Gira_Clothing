import type { AdminPrintFamily, AdminProductCategory, Wire } from "@gira/shared";

/**
 * A family or a category as the table and the modal hold it. The admin DTO also
 * carries the slug: nothing paints it, so it is cut at the HTTP boundary and
 * never reaches component props or React state. "Children" are the prints of a
 * family or the models of a category.
 */
interface PanelTaxon {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  childCount: number;
  activeChildCount: number;
  /** At most 10; `activeChildCount` is the true total. */
  activeChildren: { id: string; name: string }[];
  updatedAt: string;
}

const toPanelFamily = (family: Wire<AdminPrintFamily>): PanelTaxon => ({
  id: family.id,
  name: family.name,
  description: family.description ?? "",
  isActive: family.isActive,
  childCount: family.printCount,
  activeChildCount: family.activePrintCount,
  activeChildren: family.activePrints.map((print) => ({ id: print.id, name: print.name })),
  updatedAt: family.updatedAt,
});

const toPanelCategory = (category: Wire<AdminProductCategory>): PanelTaxon => ({
  id: category.id,
  name: category.name,
  description: category.description ?? "",
  isActive: category.isActive,
  childCount: category.productCount,
  activeChildCount: category.activeProductCount,
  activeChildren: category.activeProducts.map((product) => ({ id: product.id, name: product.name })),
  updatedAt: category.updatedAt,
});

export { toPanelFamily, toPanelCategory };
export type { PanelTaxon };
