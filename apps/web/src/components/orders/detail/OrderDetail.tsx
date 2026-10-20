"use client";

import { OrderStatus } from "@gira/shared";
import { ShippingLabelStatus } from "@gira/shared";
import { useCallback, useEffect, useState } from "react";
import { BreadcrumbLabel } from "@/components/shell/BreadcrumbLabel";
import { NB_SURFACE } from "@/components/ui/styles";
import { useOrderActions } from "@/hooks/useOrderActions";
import { fetchOrder } from "@/lib/api/adminOrders";
import { ActivityCard } from "./ActivityCard";
import { AddressCard } from "./AddressCard";
import { CancelOrderAction } from "./CancelOrderAction";
import { CustomerCard } from "./CustomerCard";
import { LogisticsCard } from "./LogisticsCard";
import { OrderHeader } from "./OrderHeader";
import { OrderLines } from "./OrderLines";
import { OrderTotals } from "./OrderTotals";
import { PaymentCard } from "./PaymentCard";
import type { PanelOrder } from "@/lib/orders/panelOrder";

/** Label states that change on their own (the background job buys or cancels the guide). */
const SETTLING_LABEL_STATUSES: readonly ShippingLabelStatus[] = [
  ShippingLabelStatus.PENDING,
  ShippingLabelStatus.REQUESTED,
  ShippingLabelStatus.CANCEL_PENDING,
];
const SETTLE_POLL_MS = 4000;
const SETTLE_MAX_POLLS = 15;

interface OrderDetailProps {
  initialOrder: PanelOrder;
}

const Divider = () => <hr className="border-t-2 border-ink" />;

/**
 * The order as a packing slip: what was bought first, administration last,
 * all in one card separated by ink rules (a card inside a card is never used).
 * Every action returns the fresh order, so the screen updates without a reload;
 * `version` makes the tracking events and the activity read again.
 */
const OrderDetail = ({ initialOrder }: OrderDetailProps) => {
  const [order, setOrder] = useState(initialOrder);
  const [version, setVersion] = useState(0);
  const onChanged = useCallback(() => setVersion((current) => current + 1), []);
  const actions = useOrderActions(onChanged);
  const busy = actions.isBusy(order.id);

  // After a retry or an address change the label is re-queued and the page would keep saying "en cola"
  // until a manual reload: read the order again every few seconds (for a minute at most) until it settles.
  const labelStatus = order.label?.status;
  useEffect(() => {
    if (!labelStatus || !SETTLING_LABEL_STATUSES.includes(labelStatus)) return;
    let cancelled = false;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (polls >= SETTLE_MAX_POLLS) clearInterval(timer);
      fetchOrder(order.id)
        .then((fresh) => {
          if (!cancelled) {
            setOrder(fresh);
            setVersion((current) => current + 1);
          }
        })
        .catch(() => {
          // A missed poll is harmless: the next one (or a reload) catches up.
        });
    }, SETTLE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [labelStatus, order.id]);

  const apply = async (pending: Promise<PanelOrder | undefined>) => {
    const next = await pending;
    if (next) setOrder(next);
    return next;
  };

  const retryLabel = async (): Promise<boolean> => {
    const accepted = await actions.retryLabel(order);
    if (accepted) {
      try {
        setOrder(await fetchOrder(order.id));
      } catch {
        // The retry itself succeeded; a failed re-read just leaves the previous view until the next action.
      }
    }
    return accepted;
  };

  return (
    <article className={`${NB_SURFACE} mx-auto flex w-full max-w-[820px] flex-col gap-6 p-6`}>
      <BreadcrumbLabel label={order.orderNumber} />
      <OrderHeader
        order={order}
        busy={busy}
        onPriorityChange={(priority) => void apply(actions.setPriority(order, priority))}
      />
      {order.status === OrderStatus.PENDING_PAYMENT ? (
        <div>
          <CancelOrderAction busy={busy} onCancelOrder={(reason) => apply(actions.cancel(order, reason))} />
        </div>
      ) : null}
      <Divider />
      <OrderLines lines={order.lines} currency={order.currency} />
      <OrderTotals order={order} />
      <Divider />
      <div className="grid gap-6 sm:grid-cols-2">
        <AddressCard order={order} onSave={async (address) => Boolean(await apply(actions.saveAddress(order, address)))} />
        <CustomerCard customer={order.customer} />
      </div>
      <Divider />
      <LogisticsCard
        order={order}
        busy={busy}
        version={version}
        onPrepare={() => void apply(actions.prepare(order))}
        onShip={() => void apply(actions.ship(order))}
        onRetryLabel={retryLabel}
      />
      <Divider />
      <div className="grid gap-6 sm:grid-cols-2">
        <PaymentCard order={order} onRefund={() => apply(actions.refund(order))} />
        <ActivityCard orderId={order.id} version={version} cancelReason={order.cancelReason} />
      </div>
    </article>
  );
};

export type { OrderDetailProps };
export { OrderDetail };
