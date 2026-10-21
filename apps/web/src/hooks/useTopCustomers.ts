"use client";

import type { TopCustomers, Wire } from "@gira/shared";
import { useCallback, useEffect, useState } from "react";
import { customerClient } from "@/lib/api/adminCustomers";
import { isApiError } from "@/lib/api/ApiError";
import { buildTopQuery, type CustomerFilters } from "@/lib/customers/filters";

type TopStatus = "loading" | "error" | "ready";

interface Settled {
  /** The query + retry counter this answer belongs to: an answer for an older one is "loading" again. */
  token: string;
  ranking: Wire<TopCustomers> | null;
  error: string | null;
}

interface UseTopCustomers {
  status: TopStatus;
  ranking: Wire<TopCustomers> | null;
  error: string | null;
  refresh: () => void;
}

const GENERIC_ERROR = "No se pudo cargar el ranking.";

/** The ranking depends only on period and order: typing in the search box never refetches it. */
const useTopCustomers = (filters: Pick<CustomerFilters, "period" | "sortBy">): UseTopCustomers => {
  const query = buildTopQuery(filters);
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const token = `${query}|${version}`;

  useEffect(() => {
    let cancelled = false;
    customerClient
      .top(query)
      .then((ranking) => {
        if (!cancelled) setSettled({ token, ranking, error: null });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setSettled({ token, ranking: null, error: isApiError(failure) ? failure.message : GENERIC_ERROR });
      });
    return () => {
      cancelled = true;
    };
  }, [query, token]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  const current = settled?.token === token ? settled : null;
  const status: TopStatus = !current ? "loading" : current.error ? "error" : "ready";
  return { status, ranking: current?.ranking ?? null, error: current?.error ?? null, refresh };
};

export type { UseTopCustomers };
export { useTopCustomers };
