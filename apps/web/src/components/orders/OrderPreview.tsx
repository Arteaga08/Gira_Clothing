
import { OrderStatus, SHIPPING_CARRIER_LABELS } from "@gira/shared";
import { ArrowUpRightIcon, CheckIcon, TruckIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { NB_CONTROL, NB_PRESSABLE, NB_SURFACE } from "@/components/ui/styles";
import { T_DATA, T_LABEL } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { formatShortDateTime } from "@/lib/format";
import { logisticsStateOf } from "@/lib/orders/logistics";
import { formatMoney } from "@/lib/orders/money";
import { DisputeBadge } from "./DisputeBadge";
import { LabelStatusChip } from "./LabelStatusChip";
import { PriorityBadge } from "./PriorityBadge";
import { TrackingStatusChip } from "./TrackingStatusChip";
import type { PanelOrder } from "@/lib/orders/panelOrder";

interface OrderPreviewProps {
  order: PanelOrder;
  busy: boolean;
  /** False while the bulk bar is on screen: only one yellow CTA per screen. */
  primaryAction: boolean;
  onPrepare: () => void;
  onShip: () => void;
}

/**
 * Right-hand summary of the selected order (desktop only). It shows the next
 * action the operator can take and a link to the full detail. Amarillo is on
 * the one primary button, and only when there is an action to take.
 */
const OrderPreview = ({ order, busy, primaryAction, onPrepare, onShip }: OrderPreviewProps) => {
  const logistics = logisticsStateOf(order);
  const carrierName = order.label?.carrier ? SHIPPING_CARRIER_LABELS[order.label.carrier] : null;

  return (
    <aside aria-label={`Vista previa de ${order.orderNumber}`} className={cn(NB_SURFACE, "sticky top-4 flex flex-col gap-4 p-6")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${T_LABEL} text-text-muted`}>Vista previa</p>
          <p className="font-mono text-lg font-bold">{order.orderNumber}</p>
          <p className="truncate text-sm">
            {order.customer.name} · {formatShortDateTime(order.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusChip status={order.status} />
          <PriorityBadge priority={order.priority} />
          <DisputeBadge status={order.disputeStatus} />
        </div>
      </div>

      <section aria-label="Logística" className="rounded-nb-sm border-2 border-ink p-3">
        <p className={`${T_LABEL} text-text-muted`}>Logística</p>
        {logistics.emptyCopy ? (
          <p className="mt-1 text-sm text-text-secondary">{logistics.emptyCopy}</p>
        ) : (
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              {order.label ? <LabelStatusChip status={order.label.status} /> : null}
              {order.tracking ? <TrackingStatusChip status={order.tracking.status} /> : null}
            </div>
            {carrierName || order.label?.trackingNumber ? (
              <p className="font-mono text-xs text-text-secondary">
                {[carrierName, order.label?.trackingNumber].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {logistics.shipBlockedReason && order.status !== OrderStatus.PAID ? (
              <p className="text-xs text-text-secondary">{logistics.shipBlockedReason}</p>
            ) : null}
          </div>
        )}
      </section>

      <section aria-label="Artículos">
        <p className={`${T_LABEL} text-text-muted`}>
          {order.lines.length === 1 ? "1 artículo" : `${order.lines.length} artículos`}
        </p>
        <ul className="mt-1 text-sm">
          {order.lines.map((line) => (
            <li key={line.sku} className="flex justify-between gap-3">
              <span className="truncate">
                {line.productName} · {line.printName}
              </span>
              <span className="font-mono">×{line.qty}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-baseline justify-between border-t-2 border-ink pt-3">
        <span className="text-sm font-bold">Total</span>
        <span className={T_DATA}>{formatMoney(order.total, order.currency)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {logistics.canPrepare ? (
          <Button variant={primaryAction ? "primary" : "secondary"} loading={busy} onClick={onPrepare} className="flex-1">
            <Icon icon={CheckIcon} />
            Pasar a en proceso
          </Button>
        ) : null}
        {logistics.canShip ? (
          <Button variant={primaryAction ? "primary" : "secondary"} loading={busy} onClick={onShip} className="flex-1">
            <Icon icon={TruckIcon} />
            Marcar enviado
          </Button>
        ) : null}
        <Link
          href={`/pedidos/${order.id}`}
          className={cn("inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold", NB_CONTROL, NB_PRESSABLE)}
        >
          Abrir pedido
          <Icon icon={ArrowUpRightIcon} />
        </Link>
      </div>
    </aside>
  );
};

export type { OrderPreviewProps };
export { OrderPreview };
