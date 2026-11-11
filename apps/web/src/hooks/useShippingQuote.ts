"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShippingDestination, ShippingQuoteResponse, Wire } from "@gira/shared";
import { quoteCartShipping } from "@/lib/api/shipping";
import { cheapestRateId, msUntilExpiry, quoteFailure } from "@/lib/checkout/shippingQuote";

type Quote = Wire<ShippingQuoteResponse>;

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; quote: Quote; rateId: string }
  | { status: "expired" }
  | { status: "no-coverage"; message: string }
  | { status: "error"; message: string };

/**
 * Carrier options for the cart and the chosen destination. The cheapest is preselected; the quote
 * expires on its own clock (the API refuses an expired one), so the page learns of it before paying.
 */
const useShippingQuote = () => {
  const [state, setState] = useState<QuoteState>({ status: "idle" });
  const latest = useRef(0);

  const request = useCallback(async (destination: ShippingDestination): Promise<void> => {
    const mine = ++latest.current;
    setState({ status: "loading" });
    try {
      const quote = await quoteCartShipping(destination);
      if (mine !== latest.current) return;
      const rateId = cheapestRateId(quote.rates);
      setState(rateId ? { status: "ready", quote, rateId } : { status: "no-coverage", message: "No hay paquetería disponible para ese código postal." });
    } catch (error) {
      if (mine !== latest.current) return;
      setState(quoteFailure(error));
    }
  }, []);

  /** Drops the quote (the address changed): a quote only fits the destination it was made for. */
  const reset = useCallback((): void => {
    latest.current += 1;
    setState({ status: "idle" });
  }, []);

  const selectRate = useCallback((rateId: string): void => {
    setState((current) => (current.status === "ready" ? { ...current, rateId } : current));
  }, []);

  const expiresAt = state.status === "ready" ? state.quote.expiresAt : null;
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = setTimeout(() => setState((s) => (s.status === "ready" ? { status: "expired" } : s)), msUntilExpiry(expiresAt, Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);

  return { state, request, reset, selectRate };
};

export type { QuoteState, Quote };
export { useShippingQuote };
