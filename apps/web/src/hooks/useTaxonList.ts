"use client";

import type { ApiMeta } from "@gira/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { isApiError } from "@/lib/api/ApiError";
import type { TaxonConfig } from "@/lib/taxonomy/config";
import { buildTaxonListQuery, type TaxonFilters } from "@/lib/taxonomy/filters";
import type { PanelTaxon } from "@/lib/taxonomy/panelTaxon";

type TaxonListStatus = "loading" | "error" | "ready";

interface TaxonListState {
  status: TaxonListStatus;
  items: PanelTaxon[];
  meta: ApiMeta | null;
  error: string | null;
}

interface UseTaxonList extends TaxonListState {
  /** Re-fetches in place: the rows stay on screen instead of flashing a skeleton. */
  refresh: () => void;
}

const INITIAL: TaxonListState = { status: "loading", items: [], meta: null, error: null };

/**
 * Fetches one page of families or categories. A change of filters resets to
 * the loading state (and drops the stale response if it arrives late);
 * `refresh` re-runs the same query silently. No polling.
 */
const useTaxonList = (
  config: TaxonConfig,
  filters: TaxonFilters,
  limit?: number,
  /** Called with the last existing page when the requested one came back empty. */
  onPageOutOfRange?: (lastPage: number) => void,
): UseTaxonList => {
  const query = buildTaxonListQuery(filters, limit);
  const [state, setState] = useState<TaxonListState>(INITIAL);
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

    config.client
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
        const error = isApiError(failure) ? failure.message : `No se pudieron cargar las ${config.title.toLowerCase()}.`;
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
  }, [config, query, version, filters.page]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { ...state, refresh };
};

export type { TaxonListStatus, UseTaxonList };
export { useTaxonList };
