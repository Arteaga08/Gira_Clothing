/**
 * The visitor's cart lives in the browser (spec §3) and is poured into
 * `/cart` on login. The key and the change event are fixed HERE so the
 * navbar counter and whatever writes the cart (M14) cannot drift apart.
 */

/** The API refuses more than this per line (cartValidator); the browser cart keeps to the same limit. */
const CART_LINE_MAX_QTY = 20;

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

const readGuestLines = (): GuestCartLine[] => {
  const raw = window.localStorage.getItem(GUEST_CART_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (line): line is GuestCartLine =>
      typeof (line as Partial<GuestCartLine> | null)?.variantId === "string" &&
      Number.isInteger((line as GuestCartLine).qty) &&
      (line as GuestCartLine).qty > 0,
  );
};

/**
 * Adds `qty` units (one by default) of a variant to the visitor's cart. Resolves
 * `false` when the browser refuses the write (blocked storage) or the line would
 * pass the maximum, so the caller can say so instead of pretending.
 */
const addToGuestCart = (variantId: string, qty = 1): boolean => {
  try {
    const lines = readGuestLines();
    const current = lines.find((line) => line.variantId === variantId);
    if ((current?.qty ?? 0) + qty > CART_LINE_MAX_QTY) return false;
    const next = current
      ? lines.map((line) => (line.variantId === variantId ? { ...line, qty: line.qty + qty } : line))
      : [...lines, { variantId, qty }];
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(next));
    announceCartChange();
    return true;
  } catch {
    return false;
  }
};

/** Call after any write to the cart so every counter on the page refreshes. */
const announceCartChange = (): void => {
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
};

export type { GuestCartLine };
export { GUEST_CART_KEY, CART_CHANGED_EVENT, CART_LINE_MAX_QTY, countGuestCart, addToGuestCart, announceCartChange };
