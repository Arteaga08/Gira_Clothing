"use client";

import { useCallback, useEffect, useState } from "react";
import type { CheckoutSummary, ShippingQuoteRef, Wire } from "@gira/shared";
import { isApiError } from "@/lib/api/ApiError";
import { previewOrder } from "@/lib/api/orders";

type SummaryState =
  | { status: "loading" }
  | { status: "ready"; summary: Wire<CheckoutSummary> }
  | { status: "error"; message: string; belowMinimum: boolean };

interface SummaryInput {
  /** The chosen rate and the postal code it was quoted for; `null` until the person picks one. */
  quote: ShippingQuoteRef | null;
  postalCode: string | null;
}

const BELOW_MINIMUM = /menos de \$10/i;

const failureOf = (error: unknown): Extract<SummaryState, { status: "error" }> => {
  const message = isApiError(error) && error.kind === "http" ? error.message : "No pudimos calcular tu total. Inténtalo de nuevo.";
  return { status: "error", message, belowMinimum: BELOW_MINIMUM.test(message) };
};

/**
 * The amounts the checkout will charge, from the server (`POST /orders/preview`): nothing here is
 * computed in the browser. It re-reads whenever the coupon or the chosen shipping changes. A coupon is
 * only kept once the server accepts it.
 */
const useCheckoutSummary = ({ quote, postalCode }: SummaryInput) => {
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  // What the server last answered, and for WHICH request. A summary is only shown while the request it answered is
  // still the current one: after any change the total reads «loading» instead of a stale amount someone could pay.
  const [settled, setSettled] = useState<{ key: string; state: Exclude<SummaryState, { status: "loading" }> } | null>(null);

  const quoteId = quote?.quoteId;
  const rateId = quote?.rateId;

  const body = useCallback(
    (code: string | null) => ({
      ...(code ? { couponCode: code } : {}),
      ...(quoteId && rateId && postalCode ? { shippingQuote: { quoteId, rateId }, postalCode } : {}),
    }),
    [quoteId, rateId, postalCode],
  );

  const requestKey = JSON.stringify(body(coupon));
  const state: SummaryState = settled?.key === requestKey ? settled.state : { status: "loading" };

  useEffect(() => {
    let current = true;
    previewOrder(body(coupon)).then(
      (summary) => {
        if (current) setSettled({ key: requestKey, state: { status: "ready", summary } });
      },
      (error: unknown) => {
        if (current) setSettled({ key: requestKey, state: failureOf(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [coupon, body, requestKey]);

  /** Tries a code against the server; resolves with the reason if it is refused, `null` once it applies. */
  const applyCoupon = useCallback(
    async (code: string): Promise<string | null> => {
      setCouponError(null);
      try {
        const summary = await previewOrder(body(code));
        setSettled({ key: JSON.stringify(body(code)), state: { status: "ready", summary } });
        setCoupon(code);
        return null;
      } catch (error) {
        const message = failureOf(error).message;
        setCouponError(message);
        return message;
      }
    },
    [body],
  );

  const removeCoupon = useCallback((): void => {
    setCouponError(null);
    setCoupon(null);
  }, []);

  return { state, coupon, couponError, applyCoupon, removeCoupon };
};

export type { SummaryState };
export { useCheckoutSummary };
