import type { CartView, Wire } from "@gira/shared";
import { expectData } from "./request";
import { CART_PATH } from "./paths";
import { serverRequest } from "./server";

type CartResult = { status: "ok"; cart: Wire<CartView> } | { status: "error" };

/** Server-side read of the signed-in customer's cart (the checkout renders its lines on the first paint). */
const getCart = async (): Promise<CartResult> => {
  try {
    const { cart } = expectData(await serverRequest<{ cart: CartView }>(CART_PATH, { timeoutMs: 5_000 }));
    return { status: "ok", cart };
  } catch {
    return { status: "error" };
  }
};

export type { CartResult };
export { getCart };
