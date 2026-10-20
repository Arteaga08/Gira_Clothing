"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchInventoryCounts } from "@/lib/api/adminVariants";
import type { InventoryCounts } from "@/lib/inventory/stats";

interface UseInventoryCounts {
  /** Null only until the first successful read: the tabs lose their number, the badges fall back to agotado / OK. */
  counts: InventoryCounts | null;
  refresh: () => void;
}

/**
 * Counts per stock state for the tab badges, plus the low-stock threshold the
 * rows are judged by. Seeded by the server read for the first paint; a failed
 * refresh keeps the last good numbers instead of breaking the list.
 */
const useInventoryCounts = (initial: InventoryCounts | null): UseInventoryCounts => {
  const [counts, setCounts] = useState<InventoryCounts | null>(initial);
  const [version, setVersion] = useState(0);
  const seeded = useRef(initial !== null);

  useEffect(() => {
    // The server already supplied the first read; only fetch on mount when it could not.
    if (seeded.current && version === 0) return;
    let cancelled = false;
    fetchInventoryCounts()
      .then((next) => {
        if (!cancelled) setCounts(next);
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

export type { UseInventoryCounts };
export { useInventoryCounts };
