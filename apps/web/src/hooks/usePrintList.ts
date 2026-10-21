"use client";

import type { ApiMeta } from "@gira/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { listPrints } from "@/lib/api/adminPrints";
import { isApiError } from "@/lib/api/ApiError";
import { buildPrintListQuery, type PrintFilters } from "@/lib/prints/filters";
import type { PanelPrint } from "@/lib/prints/panelPrint";

type PrintListStatus = "loading" | "error" | "ready";

interface PrintListState {
  status: PrintListStatus;
  prints: PanelPrint[];
  meta: ApiMeta | null;
  error: string | null;
}

interface UsePrintList extends PrintListState {
  /** Re-fetches in place: the cards stay on screen instead of flashing a skeleton. */
  refresh: () => void;
}

const INITIAL: PrintListState = { status: "loading", prints: [], meta: null, error: null };
const GENERIC_ERROR = "No se pudieron cargar las estampas.";

/**
 * Fetches one page of prints. A change of filters resets to the loading
 * state (and drops the stale response if it arrives late); `refresh` re-runs
 * the same query silently. No polling.
 */
const usePrintList = (
  filters: PrintFilters,
  limit?: number,
  /** Called with the last existing page when the requested one came back empty. */
  onPageOutOfRange?: (lastPage: number) => void,
): UsePrintList => {
  const query = buildPrintListQuery(filters, limit);
  const [state, setState] = useState<PrintListState>(INITIAL);
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

    listPrints(query)
      .then(({ prints, meta }) => {
        if (cancelled) return;
        if (prints.length === 0 && filters.page > 1 && outOfRange.current) {
          outOfRange.current(Math.max(1, meta.pages));
          return;
        }
        setState({ status: "ready", prints, meta, error: null });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const error = isApiError(failure) ? failure.message : GENERIC_ERROR;
        // A failed silent refresh keeps the cards on screen (with the error beside them); a failed first load has nothing to show.
        setState((previous) =>
          !isNewQuery && previous.status === "ready"
            ? { ...previous, error }
            : { status: "error", prints: [], meta: null, error },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [query, version, filters.page]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { ...state, refresh };
};

export type { PrintListStatus, UsePrintList };
export { usePrintList };
