import { CART_LINE_MAX_QTY } from "@/lib/cart/guestCart";
import { assertVariantId } from "@/lib/inventory/variantId";
import { browserRequest } from "./browser";
import { CART_PATH } from "./paths";
import { expectData } from "./request";

interface CartCountPayload {
  cart: { lines: { qty: number }[] };
}

interface CartLinesPayload {
  cart: { lines: { variantId: string; qty: number }[] };
}

/** Units in the signed-in customer's cart (browser side: it needs the session cookie). */
const fetchCartCount = async (signal?: AbortSignal): Promise<number> => {
  const { cart } = expectData(
    await browserRequest<CartCountPayload>(CART_PATH, signal ? { signal } : {}),
  );
  return cart.lines.reduce((total, line) => total + line.qty, 0);
};

/**
 * Adds `qty` units (one by default) to the signed-in customer's cart. The API sets an absolute
 * quantity (a retried add must not double it), so the current one is read
 * first. Resolves `false` at the per-line maximum; an unavailable variant or
 * any other refusal rejects with the API's own Spanish message.
 */
const addToAccountCart = async (variantId: string, qty = 1): Promise<boolean> => {
  const id = assertVariantId(variantId);
  const { cart } = expectData(await browserRequest<CartLinesPayload>(CART_PATH));
  const current = cart.lines.find((line) => line.variantId === id)?.qty ?? 0;
  if (current + qty > CART_LINE_MAX_QTY) return false;
  expectData(await browserRequest(`${CART_PATH}/lines/${id}`, { method: "PUT", body: { qty: current + qty } }));
  return true;
};

export { fetchCartCount, addToAccountCart };
