"use client";

import type { ApiMeta } from "@gira/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { listOrders } from "@/lib/api/adminOrders";
import { isApiError } from "@/lib/api/ApiError";
import { buildOrderListQuery, type OrderListFilters } from "@/lib/orders/filters";
import type { PanelOrder } from "@/lib/orders/panelOrder";

type OrderListStatus = "loading" | "error" | "ready";

interface OrderListState {
  status: OrderListStatus;
  orders: PanelOrder[];
  meta: ApiMeta | null;
  error: string | null;
}

interface UseOrderList extends OrderListState {
  /** Re-fetches in place: the rows stay on screen instead of flashing a skeleton. */
  refresh: () => void;
}

const INITIAL: OrderListState = { status: "loading", orders: [], meta: null, error: null };
const GENERIC_ERROR = "No se pudieron cargar los pedidos.";

/**
 * Fetches one page of the order list. A change of filters resets to the
 * loading state (and drops the stale response if it arrives late); `refresh`
 * re-runs the same query silently. No polling: the list refreshes after the
 * operator's own actions.
 */
const useOrderList = (
  filters: OrderListFilters,
  limit?: number,
  /** Called with the last existing page when the requested one came back empty (an action emptied it). */
  onPageOutOfRange?: (lastPage: number) => void,
): UseOrderList => {
  const query = buildOrderListQuery(filters, limit);
  const [state, setState] = useState<OrderListState>(INITIAL);
  const [version, setVersion] = useState(0);
  const lastQuery = useRef<string | null>(null);
  const outOfRange = useRef(onPageOutOfRange);
  useEffect(() => {
    outOfRange.current = onPageOutOfRange;
  });

  useEffect(() => {
    let cancelled = false;
    const isNewQuery = lastQuery.current !== query;
    if (isNewQuery) {
      lastQuery.current = query;
      setState(INITIAL);
    }

    listOrders(query)
      .then(({ orders, meta }) => {
        if (cancelled) return;
        if (orders.length === 0 && filters.page > 1 && outOfRange.current) {
          outOfRange.current(Math.max(1, meta.pages));
          return;
        }
        setState({ status: "ready", orders, meta, error: null });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const error = isApiError(failure) ? failure.message : GENERIC_ERROR;
        // A failed silent refresh keeps the rows on screen (with the error beside them); a failed first load has nothing to show.
        setState((previous) =>
          !isNewQuery && previous.status === "ready" ? { ...previous, error } : { status: "error", orders: [], meta: null, error },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [query, version, filters.page]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { ...state, refresh };
};

export type { OrderListStatus, UseOrderList };
export { useOrderList };
