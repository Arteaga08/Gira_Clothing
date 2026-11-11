import { CART_LINE_MAX_QTY } from "@/lib/cart/guestCart";
import { assertVariantId } from "@/lib/inventory/variantId";
import { browserRequest } from "./browser";
import type { CartView, Wire } from "@gira/shared";
import { CART_PATH, CART_PREVIEW_PATH } from "./paths";
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

/** The signed-in customer's cart lines, for merging the browser cart into it after login. */
const fetchAccountCartLines = async (): Promise<{ variantId: string; qty: number }[]> =>
  expectData(await browserRequest<CartLinesPayload>(CART_PATH)).cart.lines;

/** Sets the absolute quantity of a line (the API's contract: a retried call must not double it). */
const setAccountCartQty = async (variantId: string, qty: number): Promise<void> => {
  const id = assertVariantId(variantId);
  expectData(await browserRequest(`${CART_PATH}/lines/${id}`, { method: "PUT", body: { qty } }));
};

/** The signed-in customer's whole cart: each line with its price and whether it can still be bought. */
const fetchAccountCart = async (): Promise<Wire<CartView>> =>
  expectData(await browserRequest<{ cart: CartView }>(CART_PATH)).cart;

/**
 * The visitor's cart (it lives in the browser as `{variantId, qty}`) priced and checked by the API.
 * An empty cart never reaches the network.
 */
const previewGuestCart = async (lines: { variantId: string; qty: number }[]): Promise<Wire<CartView>> => {
  if (lines.length === 0) return { lines: [] };
  return expectData(await browserRequest<{ cart: CartView }>(CART_PREVIEW_PATH, { method: "POST", body: { lines } })).cart;
};

const removeAccountCartLine = async (variantId: string): Promise<void> => {
  const id = assertVariantId(variantId);
  expectData(await browserRequest(`${CART_PATH}/lines/${id}`, { method: "DELETE" }));
};

export {
  fetchCartCount,
  addToAccountCart,
  fetchAccountCartLines,
  setAccountCartQty,
  fetchAccountCart,
  previewGuestCart,
  removeAccountCartLine,
};
