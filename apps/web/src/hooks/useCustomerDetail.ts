"use client";

import { useCallback, useEffect, useState } from "react";
import { customerClient } from "@/lib/api/adminCustomers";
import { listOrders } from "@/lib/api/adminOrders";
import { isApiError } from "@/lib/api/ApiError";
import type { PanelCustomer } from "@/lib/customers/panelCustomer";
import type { PanelOrder } from "@/lib/orders/panelOrder";

type SectionStatus = "loading" | "error" | "ready";

interface Section<T> {
  status: SectionStatus;
  data: T | null;
  error: string | null;
  /** 404: the link is old; retrying will not help. */
  gone: boolean;
}

interface UseSection<T> extends Section<T> {
  refresh: () => void;
}

interface Settled<T> {
  token: string;
  data: T | null;
  error: string | null;
  gone: boolean;
}

const RECENT_ORDERS_LIMIT = 5;

/** `load` only closes over `key`: the answer is tied to the key + retry counter, so a stale one reads as "loading". */
const useSection = <T>(load: () => Promise<T>, key: string, genericError: string): UseSection<T> => {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const token = `${key}|${version}`;

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setSettled({ token, data, error: null, gone: false });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setSettled({
          token,
          data: null,
          gone: isApiError(failure) && failure.status === 404,
          error: isApiError(failure) ? failure.message : genericError,
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  const current = settled?.token === token ? settled : null;
  const status: SectionStatus = !current ? "loading" : current.error ? "error" : "ready";
  return { status, data: current?.data ?? null, error: current?.error ?? null, gone: current?.gone ?? false, refresh };
};

/** The customer and their recent orders load independently: the card can fail while the header stands. */
const useCustomerDetail = (id: string) => {
  const customer = useSection<PanelCustomer>(() => customerClient.get(id), id, "No se pudo cargar el cliente.");
  const orders = useSection<PanelOrder[]>(
    async () => (await listOrders(`customer=${id}&sort=-createdAt&limit=${RECENT_ORDERS_LIMIT}`)).orders,
    id,
    "No se pudieron cargar los pedidos.",
  );
  return { customer, orders };
};

export type { Section, UseSection };
export { useCustomerDetail };
