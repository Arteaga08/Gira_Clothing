import type { CartLineStatus } from "../enums/cart.js";
import type { ImageAttrs } from "./order.js";

/**
 * One line of `GET /cart` or `POST /cart/preview`. A line whose variant no longer
 * exists only carries `variantId`, `qty` and `status: retired`, enough to remove it.
 */
interface CartLineView {
  variantId: string;
  qty: number;
  status: CartLineStatus;
  sku?: string;
  productName?: string;
  printName?: string;
  image?: ImageAttrs;
  /** Live price, MXN centavos. */
  unitPriceMxn?: number;
}

interface CartView {
  lines: CartLineView[];
}

export type { CartLineView, CartView };
