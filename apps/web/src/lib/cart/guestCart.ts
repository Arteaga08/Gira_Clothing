/**
 * The visitor's cart lives in the browser (spec §3) and is poured into
 * `/cart` on login. The key and the change event are fixed HERE so the
 * navbar counter and whatever writes the cart (M14) cannot drift apart.
 */

const GUEST_CART_KEY = "gira.guestCart.v1";
const CART_CHANGED_EVENT = "gira:cart-changed";

interface GuestCartLine {
  variantId: string;
  qty: number;
}

/** Units in the visitor's cart. Corrupt, missing or blocked storage counts as an empty cart. */
const countGuestCart = (): number => {
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce<number>((total, line) => {
      const qty = (line as Partial<GuestCartLine> | null)?.qty;
      return typeof qty === "number" && Number.isInteger(qty) && qty > 0 ? total + qty : total;
    }, 0);
  } catch {
    return 0;
  }
};

/** Call after any write to the cart so every counter on the page refreshes. */
const announceCartChange = (): void => {
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
};

export type { GuestCartLine };
export { GUEST_CART_KEY, CART_CHANGED_EVENT, countGuestCart, announceCartChange };
