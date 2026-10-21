"use client";

import type { ApiMeta } from "@gira/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { customerClient } from "@/lib/api/adminCustomers";
import { isApiError } from "@/lib/api/ApiError";
import { buildCustomerListQuery, type CustomerFilters } from "@/lib/customers/filters";
import type { PanelCustomer } from "@/lib/customers/panelCustomer";

type CustomerListStatus = "loading" | "error" | "ready";

interface CustomerListState {
  status: CustomerListStatus;
  items: PanelCustomer[];
  meta: ApiMeta | null;
  error: string | null;
}

interface UseCustomerList extends CustomerListState {
  /** Re-fetches in place: the rows stay on screen instead of flashing a skeleton. */
  refresh: () => void;
}

const INITIAL: CustomerListState = { status: "loading", items: [], meta: null, error: null };
const GENERIC_ERROR = "No se pudieron cargar los clientes.";

/**
 * Fetches one page of customers. A change of filters resets to the loading state
 * (and drops the stale response if it arrives late); `refresh` re-runs the same
 * query silently. No polling.
 */
const useCustomerList = (
  filters: CustomerFilters,
  /** Called with the last existing page when the requested one came back empty. */
  onPageOutOfRange?: (lastPage: number) => void,
): UseCustomerList => {
  const query = buildCustomerListQuery(filters);
  const [state, setState] = useState<CustomerListState>(INITIAL);
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

    customerClient
      .list(query)
      .then(({ items, meta }) => {
        if (cancelled) return;
        if (items.length === 0 && filters.page > 1 && outOfRange.current) {
          outOfRange.current(Math.max(1, meta.pages));
          return;
        }
        setState({ status: "ready", items, meta, error: null });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const error = isApiError(failure) ? failure.message : GENERIC_ERROR;
        // A failed silent refresh keeps the rows on screen (with the error beside them); a failed first load has nothing to show.
        setState((previous) =>
          !isNewQuery && previous.status === "ready"
            ? { ...previous, error }
            : { status: "error", items: [], meta: null, error },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [query, version, filters.page]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { ...state, refresh };
};

export type { CustomerListStatus, UseCustomerList };
export { useCustomerList };
