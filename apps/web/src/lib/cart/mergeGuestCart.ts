import { isApiError } from "@/lib/api/ApiError";
import { fetchAccountCartLines, setAccountCartQty } from "@/lib/api/cart";
import {
  announceCartChange,
  CART_LINE_MAX_QTY,
  readGuestLines,
  writeGuestLines,
  type GuestCartLine,
} from "./guestCart";

interface MergeResult {
  /** Lines now covered by the account cart. */
  moved: number;
  /** Lines the API refused for good (variant gone, not available…): dropped. */
  dropped: number;
  /** Lines left in the browser because the failure may be temporary (network, 5xx, 429). */
  kept: number;
}

const NOTHING: MergeResult = { moved: 0, dropped: 0, kept: 0 };

/**
 * Only "that variant no longer exists" (404/410) is final. Everything else (a 401/403 while the
 * session settles, 409/429, a full cart, network, 5xx) may pass on the next try, and losing what the
 * visitor chose is worse than retrying, so those lines stay in the browser.
 */
const isDefiniteRefusal = (error: unknown): boolean =>
  isApiError(error) && error.kind === "http" && (error.status === 404 || error.status === 410);

/**
 * Pours the visitor's browser cart into the account cart after login (spec §3).
 * A variant on both sides keeps the LARGER quantity, never the sum (a retried login or a
 * second device must not double the cart), capped at CART_LINE_MAX_QTY. It never throws:
 * a cart problem must not stop the login that just worked, so what could not be moved
 * stays in the browser for the next try.
 */
const mergeGuestCart = async (): Promise<MergeResult> => {
  let guest: GuestCartLine[];
  try {
    guest = readGuestLines();
  } catch {
    return NOTHING;
  }
  if (guest.length === 0) return NOTHING;

  let account: Map<string, number>;
  try {
    account = new Map((await fetchAccountCartLines()).map((line) => [line.variantId, line.qty]));
  } catch {
    return { ...NOTHING, kept: guest.length };
  }

  const result: MergeResult = { moved: 0, dropped: 0, kept: 0 };
  // variantId → the quantity that was settled (covered by the account cart, or refused for good).
  const settled = new Map<string, number>();

  for (const line of guest) {
    const current = account.get(line.variantId) ?? 0;
    const target = Math.min(Math.max(line.qty, current), CART_LINE_MAX_QTY);
    if (target <= current) {
      result.moved += 1;
      settled.set(line.variantId, line.qty);
      continue;
    }
    try {
      await setAccountCartQty(line.variantId, target);
      result.moved += 1;
      settled.set(line.variantId, line.qty);
    } catch (error) {
      if (isDefiniteRefusal(error)) {
        result.dropped += 1;
        settled.set(line.variantId, line.qty);
      } else {
        result.kept += 1;
      }
    }
  }

  try {
    // Re-read: another tab may have added to the browser cart while this ran. Remove only what was
    // settled with the quantity that was settled; anything else stays.
    writeGuestLines(readGuestLines().filter((line) => settled.get(line.variantId) !== line.qty));
  } catch {
    // Blocked storage: the account cart already has what it could take.
  }
  announceCartChange();
  return result;
};

export type { MergeResult };
export { mergeGuestCart };
