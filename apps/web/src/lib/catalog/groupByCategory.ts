import type { PanelProduct } from "./panelProduct";

interface ProductGroup {
  id: string;
  name: string;
  products: PanelProduct[];
}

/**
 * Groups the page's products by category, in the order each category first
 * appears. The API already sorts (category name, then model name, by default),
 * so this keeps that order instead of re-sorting. Counts describe only the
 * page that was loaded.
 */
const groupProductsByCategory = (products: readonly PanelProduct[]): ProductGroup[] => {
  const groups = new Map<string, ProductGroup>();
  for (const product of products) {
    const existing = groups.get(product.category.id);
    if (existing) existing.products.push(product);
    else groups.set(product.category.id, { id: product.category.id, name: product.category.name, products: [product] });
  }
  return [...groups.values()];
};

export { groupProductsByCategory };
export type { ProductGroup };
