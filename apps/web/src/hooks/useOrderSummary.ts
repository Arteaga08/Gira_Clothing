"use client";

import type { OrderStatus } from "@gira/shared";
import { useCallback, useEffect, useState } from "react";
import { getOrderSummary } from "@/lib/api/adminOrders";

interface UseOrderSummary {
  /** Null until loaded or if the request failed: the tabs simply lose their number. */
  counts: Record<OrderStatus, number> | null;
  refresh: () => void;
}

/** Counts per status for the tab badges. Not bounded by date, on purpose (a stuck order stays stuck). */
const useOrderSummary = (): UseOrderSummary => {
  const [counts, setCounts] = useState<Record<OrderStatus, number> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getOrderSummary()
      .then((summary) => {
        if (!cancelled) setCounts(summary.countsByStatus);
      })
      .catch(() => {
        // Swallowed on purpose: a failed count must never break the list.
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { counts, refresh };
};

export type { UseOrderSummary };
export { useOrderSummary };
