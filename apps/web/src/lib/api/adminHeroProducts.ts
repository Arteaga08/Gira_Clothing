import type { Product } from "@gira/shared";
import { browserRequest } from "./browser";
import { ADMIN_PRODUCTS_PATH } from "./paths";
import { expectData } from "./request";

/**
 * Active models for the hero's «Producto» select. One page of the API's
 * maximum: the catalog is small and the photo may also lead to the shop.
 */
const fetchHeroProductOptions = async (): Promise<{ value: string; label: string }[]> => {
  const { products } = expectData(
    await browserRequest<{ products: Product[] }>(`${ADMIN_PRODUCTS_PATH}?isActive=true&limit=100&page=1`),
  );
  return products.map((product) => ({ value: product.id, label: product.name }));
};

export { fetchHeroProductOptions };
