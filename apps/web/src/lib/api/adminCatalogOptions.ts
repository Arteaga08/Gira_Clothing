import type { Print, Product, ProductCategory } from "@gira/shared";
import { toFilterOptions, type InventoryFilterOptions } from "@/lib/inventory/filterOptions";
import { browserRequest } from "./browser";
import { expectData } from "./request";

/**
 * Read-only lists that feed the inventory filters (category, model, print).
 * Active records only, one page of the API's maximum: the catalog is small and
 * the selects are an aid to the search box, not the only way to find a variant.
 */
const QUERY = "isActive=true&limit=100&page=1";

const fetchInventoryFilterOptions = async (): Promise<InventoryFilterOptions> => {
  const [categories, products, prints] = await Promise.all([
    browserRequest<{ categories: ProductCategory[] }>(`/admin/product-categories?${QUERY}`),
    browserRequest<{ products: Product[] }>(`/admin/products?${QUERY}`),
    browserRequest<{ prints: Print[] }>(`/admin/prints?${QUERY}`),
  ]);
  return toFilterOptions(
    expectData(categories).categories,
    expectData(products).products,
    expectData(prints).prints,
  );
};

export { fetchInventoryFilterOptions };
