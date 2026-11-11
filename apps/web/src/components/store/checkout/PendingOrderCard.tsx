import Link from "next/link";
import type { CustomerOrder, Wire } from "@gira/shared";
import { OrderLines } from "@/components/store/account/orders/OrderLines";
import { StorePass } from "@/components/store/pass/StorePass";
import { buttonClassName } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { T_ORDER_NUMBER, T_PASS_TITLE } from "@/components/ui/typography";
import { formatPesos } from "@/lib/catalog/money";
import { STORE_ROUTES, orderRoute } from "@/lib/store/routes";
import { CancelOrderButton } from "./CancelOrderButton";

/**
 * The checkout when an order is already waiting for payment (only one at a time is allowed): pay it or cancel it,
 * instead of a form that would be refused.
 */
const PendingOrderCard = ({ order }: { order: Wire<CustomerOrder> }) => (
  <StorePass
    tone="mint"
    stub={
      <>
        <p className="font-mono text-2xs font-bold uppercase tracking-wide text-text-muted">Total</p>
        <p className="font-display text-4xl leading-none">{formatPesos(order.total)}</p>
        <Link href={orderRoute(order.id)} className={buttonClassName("primary", "md", "w-full")}>
          Pagar
        </Link>
        <CancelOrderButton orderId={order.id} orderNumber={order.orderNumber} returnPath={STORE_ROUTES.checkout} />
      </>
    }
  >
    <header className="mb-6 grid gap-2">
      <h2 className={T_PASS_TITLE}>Tienes un pedido por pagar</h2>
      <p className="text-sm text-text-secondary">Págalo o cancélalo para hacer otro. Reservamos tus artículos por 30 minutos desde que lo creaste.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className={T_ORDER_NUMBER}>{order.orderNumber}</span>
        <StatusChip status={order.status} />
      </div>
    </header>
    <OrderLines order={order} />
  </StorePass>
);

export { PendingOrderCard };
