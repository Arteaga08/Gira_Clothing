import type { Wire, WishlistItem } from "@gira/shared";
import { expectData } from "./request";
import { serverRequest } from "./server";
import { WISHLIST_PATH } from "./paths";

type SavedItemsResult = { status: "ok"; items: Wire<WishlistItem>[] } | { status: "error" };

/** Server side, for the «Guardados» screen. A failure is a state the page draws, not an exception. */
const getSavedItems = async (): Promise<SavedItemsResult> => {
  try {
    const { items } = expectData(await serverRequest<{ items: WishlistItem[] }>(WISHLIST_PATH, { timeoutMs: 5_000 }));
    return { status: "ok", items };
  } catch {
    return { status: "error" };
  }
};

export type { SavedItemsResult };
export { getSavedItems };
