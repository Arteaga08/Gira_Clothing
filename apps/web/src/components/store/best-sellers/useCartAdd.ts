"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addToAccountCart } from "@/lib/api/cart";
import { isApiError } from "@/lib/api/ApiError";
import { addToGuestCart, announceCartChange } from "@/lib/cart/guestCart";

type CartAddStatus = "idle" | "adding" | "added" | "full" | "failed";

/** How long «Agregado» stays before the button goes back to «Agregar». */
const FEEDBACK_MS = 1800;

interface UseCartAdd {
  status: CartAddStatus;
  /** The API's own message when the add failed (an unavailable variant says so). */
  message: string | null;
  add: () => Promise<void>;
}

/**
 * Adds one unit of a variant. A visitor writes the browser cart, a signed-in
 * customer the account cart; both announce the change so the navbar counter
 * moves. Never throws: every outcome is a status the button can say.
 */
const useCartAdd = (variantId: string, authenticated: boolean): UseCartAdd => {
  const [status, setStatus] = useState<CartAddStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const settle = useCallback((next: CartAddStatus, text: string | null = null) => {
    setStatus(next);
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), FEEDBACK_MS);
  }, []);

  const add = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus("adding");
    try {
      const done = authenticated ? await addToAccountCart(variantId) : addToGuestCart(variantId);
      if (done) {
        announceCartChange();
        settle("added");
      } else settle("full");
    } catch (failure) {
      settle("failed", isApiError(failure) ? failure.message : null);
    } finally {
      busy.current = false;
    }
  }, [authenticated, settle, variantId]);

  return { status, message, add };
};

export type { CartAddStatus, UseCartAdd };
export { useCartAdd };
