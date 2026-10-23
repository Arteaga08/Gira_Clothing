import { browserRequest } from "./browser";
import { CART_PATH } from "./paths";
import { expectData } from "./request";

interface CartCountPayload {
  cart: { lines: { qty: number }[] };
}

/** Units in the signed-in customer's cart (browser side: it needs the session cookie). */
const fetchCartCount = async (signal?: AbortSignal): Promise<number> => {
  const { cart } = expectData(
    await browserRequest<CartCountPayload>(CART_PATH, signal ? { signal } : {}),
  );
  return cart.lines.reduce((total, line) => total + line.qty, 0);
};

export { fetchCartCount };
