"use client";

import type { AdminVariantActivity, Wire } from "@gira/shared";
import { useCallback, useEffect, useState } from "react";
import { getVariantActivity } from "@/lib/api/adminVariants";
import { isApiError } from "@/lib/api/ApiError";

type ActivityStatus = "loading" | "error" | "ready";

interface ActivityState {
  status: ActivityStatus;
  entries: Wire<AdminVariantActivity>[];
  error: string | null;
}

interface UseVariantActivity extends ActivityState {
  refresh: () => void;
}

const LOADING: ActivityState = { status: "loading", entries: [], error: null };
const GENERIC_ERROR = "No se pudo cargar el historial.";

/** Latest stock movements of one variant. Switching variant resets to loading and drops a late response. */
const useVariantActivity = (
  variantId: string | null,
  /** Bump it (after an adjustment) to re-read silently, without the skeleton. */
  reloadKey = 0,
): UseVariantActivity => {
  const [state, setState] = useState<ActivityState>(LOADING);
  const [version, setVersion] = useState(0);
  const [seenId, setSeenId] = useState(variantId);

  // Another variant: back to the skeleton during render (no flash of the previous one's history).
  if (variantId !== seenId) {
    setSeenId(variantId);
    setState(LOADING);
  }

  useEffect(() => {
    if (variantId === null) return;
    let cancelled = false;
    getVariantActivity(variantId)
      .then((entries) => {
        if (!cancelled) setState({ status: "ready", entries, error: null });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setState({ status: "error", entries: [], error: isApiError(failure) ? failure.message : GENERIC_ERROR });
      });
    return () => {
      cancelled = true;
    };
  }, [variantId, version, reloadKey]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { ...state, refresh };
};

export type { ActivityStatus, UseVariantActivity };
export { useVariantActivity };
