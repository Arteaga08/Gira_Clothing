"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAccountCart, previewGuestCart, removeAccountCartLine, setAccountCartQty } from "@/lib/api/cart";
import { isApiError } from "@/lib/api/ApiError";
import { announceCartChange, readGuestLines, writeGuestLines, type GuestCartLine } from "@/lib/cart/guestCart";
import type { CartLine } from "@/lib/checkout/cartTotals";

type CartPageState = { status: "loading" } | { status: "error" } | { status: "ready"; lines: CartLine[] };

const safeReadGuest = (): GuestCartLine[] => {
  try {
    return readGuestLines();
  } catch {
    return [];
  }
};

/**
 * The cart page's data and its two edits. A visitor's cart lives in the browser and is priced by
 * `POST /cart/preview`; a customer's lives in the account and is read with `GET /cart`. Either way a
 * line carries its status, so the page can mark what cannot be bought.
 */
const useCartPage = (authenticated: boolean) => {
  const [state, setState] = useState<CartPageState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const busy = useRef(false);

  const read = useCallback(async (): Promise<CartLine[]> => {
    const cart = authenticated ? await fetchAccountCart() : await previewGuestCart(safeReadGuest());
    return cart.lines;
  }, [authenticated]);

  const load = useCallback(async (): Promise<void> => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", lines: await read() });
    } catch {
      setState({ status: "error" });
    }
  }, [read]);

  // First read: the state already starts as «loading», so the effect only reports what comes back.
  useEffect(() => {
    let current = true;
    read().then(
      (lines) => {
        if (current) setState({ status: "ready", lines });
      },
      () => {
        if (current) setState({ status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [read]);

  /** One edit at a time: runs it, tells the navbar, and re-reads so statuses and prices are the API's. Resolves `false` if another edit was in flight and this one was dropped. */
  const edit = useCallback(
    async (variantId: string, apply: () => Promise<void>, optimistic?: (lines: CartLine[]) => CartLine[]): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setBusyId(variantId);
      setFailure(null);
      if (optimistic) setState((s) => (s.status === "ready" ? { status: "ready", lines: optimistic(s.lines) } : s));
      try {
        await apply();
        announceCartChange();
      } catch (error) {
        // 410: the product was retired meanwhile. The re-read below will mark the line instead of failing.
        if (!(isApiError(error) && error.status === 410)) {
          setFailure("No pudimos actualizar tu carrito. Inténtalo de nuevo.");
        }
      }
      try {
        setState({ status: "ready", lines: await read() });
      } catch {
        setState({ status: "error" });
      } finally {
        busy.current = false;
        setBusyId(null);
      }
      return true;
    },
    [read],
  );

  const changeQty = useCallback(
    (variantId: string, qty: number) =>
      edit(
        variantId,
        async () => {
          if (authenticated) await setAccountCartQty(variantId, qty);
          else writeGuestLines(safeReadGuest().map((l) => (l.variantId === variantId ? { ...l, qty } : l)));
        },
        (lines) => lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l)),
      ),
    [authenticated, edit],
  );

  const remove = useCallback(
    (variantId: string) =>
      edit(
        variantId,
        async () => {
          if (authenticated) await removeAccountCartLine(variantId);
          else writeGuestLines(safeReadGuest().filter((l) => l.variantId !== variantId));
        },
        (lines) => lines.filter((l) => l.variantId !== variantId),
      ),
    [authenticated, edit],
  );

  return { state, busyId, failure, reload: load, changeQty, remove };
};

export type { CartPageState };
export { useCartPage };
