"use client";

import type { ApiMeta } from "@gira/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { listProducts } from "@/lib/api/adminProducts";
import { isApiError } from "@/lib/api/ApiError";
import { buildProductListQuery, type CatalogFilters } from "@/lib/catalog/filters";
import type { PanelProduct } from "@/lib/catalog/panelProduct";

type ProductListStatus = "loading" | "error" | "ready";

interface ProductListState {
  status: ProductListStatus;
  products: PanelProduct[];
  meta: ApiMeta | null;
  error: string | null;
}

interface UseProductList extends ProductListState {
  /** Re-fetches in place: the cards stay on screen instead of flashing a skeleton. */
  refresh: () => void;
}

const INITIAL: ProductListState = { status: "loading", products: [], meta: null, error: null };
const GENERIC_ERROR = "No se pudo cargar el catálogo.";

/**
 * Fetches one page of products. A change of filters resets to the loading
 * state (and drops the stale response if it arrives late); `refresh` re-runs
 * the same query silently. No polling.
 */
const useProductList = (
  filters: CatalogFilters,
  limit?: number,
  /** Called with the last existing page when the requested one came back empty. */
  onPageOutOfRange?: (lastPage: number) => void,
): UseProductList => {
  const query = buildProductListQuery(filters, limit);
  const [state, setState] = useState<ProductListState>(INITIAL);
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

    listProducts(query)
      .then(({ products, meta }) => {
        if (cancelled) return;
        if (products.length === 0 && filters.page > 1 && outOfRange.current) {
          outOfRange.current(Math.max(1, meta.pages));
          return;
        }
        setState({ status: "ready", products, meta, error: null });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const error = isApiError(failure) ? failure.message : GENERIC_ERROR;
        // A failed silent refresh keeps the cards on screen (with the error beside them); a failed first load has nothing to show.
        setState((previous) =>
          !isNewQuery && previous.status === "ready"
            ? { ...previous, error }
            : { status: "error", products: [], meta: null, error },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [query, version, filters.page]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { ...state, refresh };
};

export type { ProductListStatus, UseProductList };
export { useProductList };
