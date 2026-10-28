import Link from "next/link";
import type { CustomerOrder, Wire } from "@gira/shared";
import { buttonClassName } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { T_DATA, T_PANEL_TITLE } from "@/components/ui/typography";
import { formatShortDate } from "@/lib/format";
import { formatMoney } from "@/lib/orders/money";
import { orderRoute } from "@/lib/store/routes";
import { EmptyOrders } from "../orders/EmptyOrders";
import { OrderThumbs } from "../orders/OrderThumbs";

/** «Último pedido» of the summary: the newest order, or the invitation to make the first one. */
const LastOrderPanel = ({ order }: { order: Wire<CustomerOrder> | null }) => (
  <section aria-labelledby="last-order-title">
    <h2 id="last-order-title" className={`${T_PANEL_TITLE} mb-4 text-2xl`}>
      Último pedido
    </h2>
    {order ? (
      <div className="grid gap-4">
        <OrderThumbs lines={order.lines} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1.5">
            <span className={T_DATA}>{order.orderNumber}</span>
            <span className="flex items-center gap-2">
              <StatusChip status={order.status} />
              <span className="text-xs text-text-muted">{formatShortDate(new Date(order.createdAt))}</span>
            </span>
          </div>
          <span className="font-mono text-base font-bold">{formatMoney(order.total, order.currency)}</span>
        </div>
        <Link href={orderRoute(order.id)} className={buttonClassName("edit", "sm", "justify-self-start")}>
          Ver pedido
        </Link>
      </div>
    ) : (
      <EmptyOrders description="Cuando hagas tu primer pedido lo verás aquí." />
    )}
  </section>
);

export { LastOrderPanel };
