import type { AdminProduct, ApiMeta } from "@gira/shared";
import { toEditorProduct, type EditorProduct } from "@/lib/catalog/editorProduct";
import { toPanelProduct, type PanelProduct } from "@/lib/catalog/panelProduct";
import { assertProductId } from "@/lib/catalog/productId";
import type { CreateProductBody, UpdateProductBody } from "@/lib/catalog/productForm";
import { browserRequest } from "./browser";
import { ADMIN_PRODUCTS_PATH } from "./paths";
import { expectData } from "./request";

/**
 * Browser-side client for /admin/products. Everything goes through
 * `browserRequest`: the list refreshes in the client and every mutation must
 * leave with a real Origin header (see browser.ts). Product endpoints wrap
 * their payload in a named key (`products`, `product`).
 */

const productApiPath = (id: string): string => `${ADMIN_PRODUCTS_PATH}/${assertProductId(id)}`;

const listProducts = async (query: string): Promise<{ products: PanelProduct[]; meta: ApiMeta }> => {
  const result = await browserRequest<{ products: AdminProduct[] }>(`${ADMIN_PRODUCTS_PATH}?${query}`);
  const { products } = expectData(result);
  return {
    products: products.map(toPanelProduct),
    meta: result.meta ?? { total: products.length, page: 1, pages: 1, limit: products.length },
  };
};

const getEditorProduct = async (id: string): Promise<EditorProduct> =>
  toEditorProduct(expectData(await browserRequest<{ product: AdminProduct }>(productApiPath(id))).product);

/** Creates the model and answers its id; the variants are created afterwards, one by one. */
const createProduct = async (body: CreateProductBody): Promise<string> =>
  expectData(await browserRequest<{ product: AdminProduct }>(ADMIN_PRODUCTS_PATH, { method: "POST", body })).product.id;

const updateProduct = async (id: string, body: UpdateProductBody): Promise<void> => {
  await browserRequest<{ product: AdminProduct }>(productApiPath(id), { method: "PATCH", body });
};

/** Soft delete. The API answers 409 (with its own Spanish message) while the model still has active variants. */
const retireProduct = async (id: string): Promise<void> => {
  await browserRequest<{ product: AdminProduct }>(productApiPath(id), { method: "DELETE" });
};

const reactivateProduct = async (id: string): Promise<void> => {
  await browserRequest<{ product: AdminProduct }>(productApiPath(id), { method: "PATCH", body: { isActive: true } });
};

export { listProducts, getEditorProduct, createProduct, updateProduct, retireProduct, reactivateProduct };
