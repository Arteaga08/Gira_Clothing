
import { OrderStatus } from "@gira/shared";
import Link from "next/link";
import type { MouseEvent } from "react";
import { StatusChip } from "@/components/ui/StatusChip";
import { NB_SURFACE } from "@/components/ui/styles";
import { T_DATA } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { formatShortDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/orders/money";
import { DisputeBadge } from "./DisputeBadge";
import { PriorityBadge } from "./PriorityBadge";
import type { PanelOrder } from "@/lib/orders/panelOrder";

interface OrderCardProps {
  order: PanelOrder;
  /** The order shown in the preview pane (desktop). */
  previewed: boolean;
  checked: boolean;
  /** Checkbox disabled: only paid orders can be bulk-prepared, and the selection has a ceiling. */
  selectable: boolean;
  busy: boolean;
  onPreview: () => void;
  onToggleChecked: () => void;
}

const OrderCardBody = ({ order }: { order: PanelOrder }) => (
  <>
    <span className="flex items-baseline justify-between gap-3">
      <span className={T_DATA}>{order.orderNumber}</span>
      <span className={T_DATA}>{formatMoney(order.total, order.currency)}</span>
    </span>
    <span className="mt-1 flex items-center justify-between gap-3">
      <span className="truncate text-sm">{order.customer.name}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <PriorityBadge priority={order.priority} />
        <DisputeBadge status={order.disputeStatus} />
        <StatusChip status={order.status} />
      </span>
    </span>
    <span className="mt-0.5 block text-2xs text-text-muted">{formatShortDateTime(order.createdAt)}</span>
  </>
);

/** Matches Tailwind's `lg`: the breakpoint where the preview pane exists. */
const PREVIEW_QUERY = "(min-width: 1024px)";

const previewPaneVisible = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PREVIEW_QUERY).matches;

/**
 * One order in the list: a single link to the detail. Where the preview pane
 * exists (`lg+`) a plain click selects the order for the preview instead of
 * navigating; modified clicks (new tab) and every smaller screen follow the
 * link. Without JavaScript it is simply a link. The checkbox sits beside the
 * link, never inside it, so no interactive element is nested in another.
 */
const OrderCard = ({ order, previewed, checked, selectable, busy, onPreview, onToggleChecked }: OrderCardProps) => {
  const canBulk = order.status === OrderStatus.PAID;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
    if (modified || !previewPaneVisible()) return;
    event.preventDefault();
    onPreview();
  };

  return (
    <article
      {...(busy ? { "data-busy": "true" } : {})}
      className={cn(
        NB_SURFACE,
        "flex items-stretch gap-3 p-3 shadow-nb-sm",
        previewed && "bg-brand-subtle shadow-nb-lg",
        busy && "pointer-events-none opacity-50",
      )}
    >
      {canBulk ? (
        <input
          type="checkbox"
          checked={checked}
          disabled={!selectable && !checked}
          onChange={onToggleChecked}
          aria-label={`Seleccionar ${order.orderNumber}`}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
        />
      ) : null}
      <Link
        href={`/pedidos/${order.id}`}
        onClick={handleClick}
        {...(previewed ? { "aria-current": "true" as const } : {})}
        className="block min-w-0 flex-1"
      >
        <OrderCardBody order={order} />
      </Link>
    </article>
  );
};

export type { OrderCardProps };
export { OrderCard };
