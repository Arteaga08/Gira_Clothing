"use client";

import type { ApiMeta } from "@gira/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { auditClient, type PanelAuditLog } from "@/lib/api/adminAudit";
import { isApiError } from "@/lib/api/ApiError";
import { buildAuditListQuery, type AuditFilters } from "@/lib/audit/filters";

type AuditListStatus = "loading" | "error" | "ready";

interface AuditListState {
  status: AuditListStatus;
  items: PanelAuditLog[];
  meta: ApiMeta | null;
  error: string | null;
}

interface UseAuditList extends AuditListState {
  refresh: () => void;
}

const INITIAL: AuditListState = { status: "loading", items: [], meta: null, error: null };
const GENERIC_ERROR = "No se pudo cargar la auditoría.";

/**
 * Fetches one page of the trail. A change of filters resets to loading and
 * drops a late response; «Reintentar» re-runs the same query. No polling: the
 * trail is read when the operator looks, not streamed.
 */
const useAuditList = (
  filters: AuditFilters,
  /** Called with the last existing page when the requested one came back empty. */
  onPageOutOfRange?: (lastPage: number) => void,
): UseAuditList => {
  const query = buildAuditListQuery(filters);
  const [state, setState] = useState<AuditListState>(INITIAL);
  const [version, setVersion] = useState(0);
  const lastQuery = useRef<string | null>(null);
  const outOfRange = useRef(onPageOutOfRange);
  useEffect(() => {
    outOfRange.current = onPageOutOfRange;
  });

  useEffect(() => {
    let cancelled = false;
    if (lastQuery.current !== query) {
      lastQuery.current = query;
      setState(INITIAL);
    }
    auditClient
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
        if (!cancelled) {
          setState({ status: "error", items: [], meta: null, error: isApiError(failure) ? failure.message : GENERIC_ERROR });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query, version, filters.page]);

  // «Reintentar» comes from a click: back to the skeleton, then the same query again.
  const refresh = useCallback(() => {
    setState(INITIAL);
    setVersion((current) => current + 1);
  }, []);

  return { ...state, refresh };
};

export type { AuditListStatus, UseAuditList };
export { useAuditList };
