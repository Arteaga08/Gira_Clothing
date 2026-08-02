"use client";

import type { OutboxHealth, Wire } from "@gira/shared";
import { useEffect, useState } from "react";
import { fetchOutboxHealth } from "@/lib/api/outbox";

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls the outbox health endpoint for the TopBar's notification bell. This
 * lives in the shell — every one of the eleven screens — so a failure here
 * must never throw past this hook: a downed endpoint just means no badge,
 * never a broken page (DASHBOARD_GUIDELINES §4/§6 polling pattern).
 */
const useOutboxHealth = (): Wire<OutboxHealth> | null => {
  const [health, setHealth] = useState<Wire<OutboxHealth> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await fetchOutboxHealth();
        if (!cancelled) setHealth(result);
      } catch {
        // Swallowed on purpose — see the docblock above.
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return health;
};

export { useOutboxHealth, POLL_INTERVAL_MS };
