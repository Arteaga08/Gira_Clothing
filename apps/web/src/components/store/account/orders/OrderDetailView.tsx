import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { CustomerOrder, Wire } from "@gira/shared";
import { StatusChip } from "@/components/ui/StatusChip";
import { T_ORDER_NUMBER } from "@/components/ui/typography";
import { formatLongDate } from "@/lib/format";
import { STORE_ROUTES } from "@/lib/store/routes";
import { OrderLines } from "./OrderLines";
import { OrderShippingInfo } from "./OrderShippingInfo";

/** One order, read-only: folio and status, what was bought and where it goes. Paying or cancelling belongs to M16. */
const OrderDetailView = ({ order }: { order: Wire<CustomerOrder> }) => (
  <article className="grid gap-6">
    <header className="grid gap-2">
      <Link href={STORE_ROUTES.orders} className="inline-flex items-center gap-1 text-sm font-bold underline-offset-4 hover:underline">
        <CaretLeft aria-hidden="true" weight="bold" />
        Volver a mis pedidos
      </Link>
      <h1 className={T_ORDER_NUMBER}>{order.orderNumber}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={order.status} />
        <span className="text-sm text-text-secondary">{`Hecho el ${formatLongDate(new Date(order.createdAt))}`}</span>
      </div>
    </header>
    <div className="border-t-2 border-dashed border-ink pt-6">
      <OrderLines order={order} />
    </div>
    <div className="border-t-2 border-dashed border-ink pt-6">
      <OrderShippingInfo order={order} />
    </div>
  </article>
);

export { OrderDetailView };
