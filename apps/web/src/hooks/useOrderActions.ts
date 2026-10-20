"use client";

import type { OrderPriority, ShippingAddress } from "@gira/shared";
import { OrderStatus, ORDER_PRIORITY_LABELS } from "@gira/shared";
import { useCallback, useRef, useState } from "react";
import { useToast, type ToastInput } from "@/components/ui/Toast";
import {
  bulkMarkProcessing,
  markShipped,
  requestRefund,
  retryLabel,
  updateOrderPriority,
  updateOrderStatus,
  updateShippingAddress,
} from "@/lib/api/adminOrders";
import { isApiError } from "@/lib/api/ApiError";
import type { PanelOrder } from "@/lib/orders/panelOrder";

type OrderRef = Pick<PanelOrder, "id" | "orderNumber">;

const BULK_KEY = "bulk";
const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

interface UseOrderActions {
  /** True while that order (or a bulk run, which locks every order) is being processed: dim the row, disable its buttons. */
  isBusy: (id: string) => boolean;
  prepare: (order: OrderRef) => Promise<PanelOrder | undefined>;
  ship: (order: OrderRef) => Promise<PanelOrder | undefined>;
  cancel: (order: OrderRef, reason: string) => Promise<PanelOrder | undefined>;
  refund: (order: OrderRef) => Promise<PanelOrder | undefined>;
  setPriority: (order: OrderRef, priority: OrderPriority) => Promise<PanelOrder | undefined>;
  saveAddress: (order: OrderRef, address: ShippingAddress) => Promise<PanelOrder | undefined>;
  retryLabel: (order: OrderRef) => Promise<boolean>;
  bulkPrepare: (orders: readonly OrderRef[]) => Promise<boolean>;
}

/**
 * Wraps every mutation of the orders panel: busy flag, a toast with the order
 * NUMBER (never the id), the API's own Spanish message on failure (403/409
 * already read well), and `onChanged` after a success so the list, the
 * counters and the open order refresh together.
 */
const useOrderActions = (onChanged: () => void): UseOrderActions => {
  const { toast } = useToast();
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  // Mirrors `busyKeys` synchronously: two clicks in the same tick must not both pass the guard.
  const inFlight = useRef(new Set<string>());

  const markBusy = (key: string, busy: boolean) => {
    if (busy) inFlight.current.add(key);
    else inFlight.current.delete(key);
    setBusyKeys(new Set(inFlight.current));
  };

  const isBusy = useCallback((id: string) => busyKeys.has(id) || busyKeys.has(BULK_KEY), [busyKeys]);

  const run = useCallback(
    async <T>(key: string, task: () => Promise<T>, onSuccess: (result: T) => ToastInput): Promise<T | undefined> => {
      if (inFlight.current.has(key) || (key !== BULK_KEY && inFlight.current.has(BULK_KEY))) return undefined;
      if (key === BULK_KEY && inFlight.current.size > 0) return undefined;
      markBusy(key, true);
      try {
        const result = await task();
        toast(onSuccess(result));
        onChanged();
        return result;
      } catch (failure) {
        toast({
          variant: "error",
          title: "No se pudo completar la acción",
          description: isApiError(failure) ? failure.message : GENERIC_ERROR,
        });
        return undefined;
      } finally {
        markBusy(key, false);
      }
    },
    [toast, onChanged],
  );

  const prepare: UseOrderActions["prepare"] = (order) =>
    run(order.id, () => updateOrderStatus(order.id, OrderStatus.PROCESSING), () => ({
      variant: "success",
      title: `${order.orderNumber} pasó a en proceso`,
    }));

  const ship: UseOrderActions["ship"] = (order) =>
    run(order.id, () => markShipped(order.id), () => ({
      variant: "success",
      title: `${order.orderNumber} marcado como enviado`,
      description: "Avisamos al cliente por correo con la guía.",
    }));

  const cancel: UseOrderActions["cancel"] = (order, reason) =>
    run(order.id, () => updateOrderStatus(order.id, OrderStatus.CANCELLED, reason), () => ({
      variant: "success",
      title: `${order.orderNumber} cancelado`,
    }));

  const refund: UseOrderActions["refund"] = (order) =>
    run(order.id, () => requestRefund(order.id), () => ({
      variant: "info",
      title: `Reembolso solicitado para ${order.orderNumber}`,
      description: "El estado pasará a reembolsado cuando Stripe lo confirme.",
    }));

  const setPriority: UseOrderActions["setPriority"] = (order, priority) =>
    run(order.id, () => updateOrderPriority(order.id, priority), () => ({
      variant: "success",
      title: `Prioridad de ${order.orderNumber}: ${ORDER_PRIORITY_LABELS[priority]}`,
    }));

  const saveAddress: UseOrderActions["saveAddress"] = (order, address) =>
    run(order.id, () => updateShippingAddress(order.id, address), () => ({
      variant: "success",
      title: `Dirección de ${order.orderNumber} actualizada`,
    }));

  const retry: UseOrderActions["retryLabel"] = async (order) => {
    const message = await run(order.id, () => retryLabel(order.id), (text) => ({
      variant: "info",
      title: `Guía de ${order.orderNumber}`,
      description: text,
    }));
    return message !== undefined;
  };

  const bulkPrepare: UseOrderActions["bulkPrepare"] = async (orders) => {
    const result = await run(BULK_KEY, () => bulkMarkProcessing(orders.map((order) => order.id)), (outcome) => {
      const { updated, unchanged, rejected } = outcome.summary;
      const rejectedDetail = outcome.results
        .filter((entry) => entry.outcome === "rejected")
        .map((entry) => `${entry.orderNumber}${entry.message ? `: ${entry.message}` : ""}`)
        .join(" · ");
      return {
        variant: rejected > 0 ? "warning" : "success",
        title: `${updated} en proceso, ${unchanged} sin cambio, ${rejected} rechazados`,
        ...(rejectedDetail ? { description: rejectedDetail } : {}),
      };
    });
    return result !== undefined;
  };

  return { isBusy, prepare, ship, cancel, refund, setPriority, saveAddress, retryLabel: retry, bulkPrepare };
};

export type { OrderRef, UseOrderActions };
export { useOrderActions };
