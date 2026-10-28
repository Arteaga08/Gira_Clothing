import Link from "next/link";
import type { CustomerOrder, Wire } from "@gira/shared";
import { buttonClassName } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { T_DATA } from "@/components/ui/typography";
import { formatShortDate } from "@/lib/format";
import { formatMoney } from "@/lib/orders/money";
import { orderRoute } from "@/lib/store/routes";
import { OrderThumbs } from "./OrderThumbs";
import { orderSummary } from "./orderSummary";

/** One order of the list: photos, folio and status, what it holds, date, total and the way in. */
const OrderRow = ({ order }: { order: Wire<CustomerOrder> }) => (
  <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
    <OrderThumbs lines={order.lines} />
    <div className="min-w-0 flex-1 basis-48">
      <div className="flex flex-wrap items-center gap-2">
        <span className={T_DATA}>{order.orderNumber}</span>
        <StatusChip status={order.status} />
      </div>
      <p className="mt-1 truncate text-sm">{orderSummary(order.lines)}</p>
      <p className="text-xs text-text-muted">{formatShortDate(new Date(order.createdAt))}</p>
    </div>
    <span className="font-mono text-sm font-bold">{formatMoney(order.total, order.currency)}</span>
    <Link href={orderRoute(order.id)} className={buttonClassName("edit", "sm")}>
      Ver detalle
    </Link>
  </li>
);

export { OrderRow };
