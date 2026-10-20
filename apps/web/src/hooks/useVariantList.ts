"use client";

import type { ApiMeta } from "@gira/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { listVariants } from "@/lib/api/adminVariants";
import { isApiError } from "@/lib/api/ApiError";
import { buildVariantListQuery, type InventoryFilters } from "@/lib/inventory/filters";
import type { PanelVariant } from "@/lib/inventory/panelVariant";

type VariantListStatus = "loading" | "error" | "ready";

interface VariantListState {
  status: VariantListStatus;
  variants: PanelVariant[];
  meta: ApiMeta | null;
  error: string | null;
}

interface UseVariantList extends VariantListState {
  /** Re-fetches in place: the rows stay on screen instead of flashing a skeleton. */
  refresh: () => void;
  /** Swaps one row for the variant the API just returned, so a saved adjustment shows before the refetch lands. */
  replaceVariant: (variant: PanelVariant) => void;
}

const INITIAL: VariantListState = { status: "loading", variants: [], meta: null, error: null };
const GENERIC_ERROR = "No se pudo cargar el inventario.";

/**
 * Fetches one page of variants. A change of filters resets to the loading state
 * (and drops the stale response if it arrives late); `refresh` re-runs the same
 * query silently. No polling: the list refreshes after the operator's own actions.
 */
const useVariantList = (
  filters: InventoryFilters,
  limit?: number,
  /** Called with the last existing page when the requested one came back empty. */
  onPageOutOfRange?: (lastPage: number) => void,
): UseVariantList => {
  const query = buildVariantListQuery(filters, limit);
  const [state, setState] = useState<VariantListState>(INITIAL);
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

    listVariants(query)
      .then(({ variants, meta }) => {
        if (cancelled) return;
        if (variants.length === 0 && filters.page > 1 && outOfRange.current) {
          outOfRange.current(Math.max(1, meta.pages));
          return;
        }
        setState({ status: "ready", variants, meta, error: null });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const error = isApiError(failure) ? failure.message : GENERIC_ERROR;
        // A failed silent refresh keeps the rows on screen (with the error beside them); a failed first load has nothing to show.
        setState((previous) =>
          !isNewQuery && previous.status === "ready"
            ? { ...previous, error }
            : { status: "error", variants: [], meta: null, error },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [query, version, filters.page]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const replaceVariant = useCallback(
    (variant: PanelVariant) =>
      setState((previous) => ({
        ...previous,
        variants: previous.variants.map((row) => (row.id === variant.id ? variant : row)),
      })),
    [],
  );

  return { ...state, refresh, replaceVariant };
};

export type { VariantListStatus, UseVariantList };
export { useVariantList };
