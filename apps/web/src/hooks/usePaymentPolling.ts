"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OrderStatus } from "@gira/shared";
import { fetchPublicOrderStatus } from "@/lib/api/orders";

type PollingPhase = "polling" | "timed-out";

interface PollingOptions {
  publicId: string;
  fetchStatus?: (publicId: string) => Promise<OrderStatus>;
  intervalMs?: number;
  maxAttempts?: number;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 10;

/**
 * Watches a pending order while the bank (or the webhook) confirms it. It never decides «paid»: when
 * the status moves, or the attempts run out, it re-renders the Server Component, which reads the real
 * status. A network blip just skips that tick.
 */
const usePaymentPolling = ({
  publicId,
  fetchStatus = fetchPublicOrderStatus,
  intervalMs = POLL_INTERVAL_MS,
  maxAttempts = POLL_MAX_ATTEMPTS,
}: PollingOptions): PollingPhase => {
  const router = useRouter();
  // The router object can change between renders; the polling effect must not restart with it.
  const refreshRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    refreshRef.current = () => router.refresh();
  });
  const [phase, setPhase] = useState<PollingPhase>("polling");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async (): Promise<void> => {
      attempts += 1;
      let moved = false;
      try {
        moved = (await fetchStatus(publicId)) !== OrderStatus.PENDING_PAYMENT;
      } catch {
        // Offline for a moment: the next tick tries again.
      }
      if (cancelled) return;
      if (moved) {
        refreshRef.current();
        return;
      }
      if (attempts >= maxAttempts) {
        setPhase("timed-out");
        refreshRef.current();
        return;
      }
      timer = setTimeout(() => void tick(), intervalMs);
    };

    timer = setTimeout(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [publicId, fetchStatus, intervalMs, maxAttempts]);

  return phase;
};

export type { PollingPhase };
export { usePaymentPolling };
