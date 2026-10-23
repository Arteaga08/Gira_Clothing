"use client";

import { useEffect, useState } from "react";
import { fetchCartCount } from "@/lib/api/cart";
import { CART_CHANGED_EVENT, GUEST_CART_KEY, countGuestCart } from "@/lib/cart/guestCart";

/**
 * Units in the cart for the navbar counter. Signed in: the account cart from
 * the API. Visitor: the browser cart. Both refresh on the shared change
 * event; the visitor's also on `storage` (another tab). A failed fetch keeps
 * the last known count: a counter must never throw.
 */
const useCartCount = (authenticated: boolean): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const refresh = () => {
      if (!authenticated) {
        setCount(countGuestCart());
        return;
      }
      fetchCartCount(controller.signal)
        .then(setCount)
        .catch(() => undefined);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === GUEST_CART_KEY) refresh();
    };

    refresh();
    window.addEventListener(CART_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      controller.abort();
      window.removeEventListener(CART_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [authenticated]);

  return count;
};

export { useCartCount };
