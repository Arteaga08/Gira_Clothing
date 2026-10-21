import type { OrderPriority } from "@gira/shared";
import { OrderPriority as Priority, ORDER_PRIORITY_LABELS } from "@gira/shared";
import { SelectField } from "@/components/ui/SelectField";
import { StatusChip } from "@/components/ui/StatusChip";
import { T_LABEL, T_ORDER_NUMBER } from "@/components/ui/typography";
import { formatShortDateTime } from "@/lib/format";
import { DisputeBadge } from "../DisputeBadge";
import type { PanelOrder } from "@/lib/orders/panelOrder";

interface OrderHeaderProps {
  order: PanelOrder;
  busy: boolean;
  onPriorityChange: (priority: OrderPriority) => void;
}

const PRIORITY_OPTIONS = Object.values(Priority).map((priority) => ({
  value: priority,
  label: ORDER_PRIORITY_LABELS[priority],
}));

/**
 * Folio, status, and the priority selector. Changing priority is inline, with
 * no dialog: it only reorders the queue and never conditions a transition.
 */
const OrderHeader = ({ order, busy, onPriorityChange }: OrderHeaderProps) => (
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0">
      <p className={`${T_LABEL} text-text-muted`}>Pedido</p>
      <h2 className={T_ORDER_NUMBER}>{order.orderNumber}</h2>
      <p className="mt-1 text-sm text-text-secondary">
        {order.customer.name} · creado {formatShortDateTime(order.createdAt)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusChip status={order.status} />
        <DisputeBadge status={order.disputeStatus} />
      </div>
    </div>
    <SelectField
      label="Prioridad"
      options={PRIORITY_OPTIONS}
      value={order.priority}
      disabled={busy}
      onChange={(next) => onPriorityChange(next as OrderPriority)}
      containerClassName="w-40"
    />
  </div>
);

export type { OrderHeaderProps };
export { OrderHeader };
