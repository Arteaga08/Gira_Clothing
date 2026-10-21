"use client";

import type { ApiMeta } from "@gira/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { couponClient } from "@/lib/api/adminCoupons";
import { isApiError } from "@/lib/api/ApiError";
import { buildCouponListQuery, type CouponFilters } from "@/lib/coupons/filters";
import type { PanelCoupon } from "@/lib/coupons/panelCoupon";

type CouponListStatus = "loading" | "error" | "ready";

interface CouponListState {
  status: CouponListStatus;
  items: PanelCoupon[];
  meta: ApiMeta | null;
  error: string | null;
}

interface UseCouponList extends CouponListState {
  /** Re-fetches in place: the rows stay on screen instead of flashing a skeleton. */
  refresh: () => void;
}

const INITIAL: CouponListState = { status: "loading", items: [], meta: null, error: null };
const GENERIC_ERROR = "No se pudieron cargar los cupones.";

/**
 * Fetches one page of coupons. A change of filters resets to the loading state
 * (and drops the stale response if it arrives late); `refresh` re-runs the same
 * query silently. No polling.
 */
const useCouponList = (
  filters: CouponFilters,
  /** Called with the last existing page when the requested one came back empty. */
  onPageOutOfRange?: (lastPage: number) => void,
): UseCouponList => {
  const query = buildCouponListQuery(filters);
  const [state, setState] = useState<CouponListState>(INITIAL);
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

    couponClient
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

export type { CouponListStatus, UseCouponList };
export { useCouponList };
