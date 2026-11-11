import Link from "next/link";
import { OrderStatus, type PublicOrder, type Wire } from "@gira/shared";
import { OrderLines } from "@/components/store/account/orders/OrderLines";
import { OrderShippingInfo } from "@/components/store/account/orders/OrderShippingInfo";
import { StorePass } from "@/components/store/pass/StorePass";
import { buttonClassName } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { T_ORDER_NUMBER, T_PASS_TITLE } from "@/components/ui/typography";
import { formatPesos } from "@/lib/catalog/money";
import { STORE_ROUTES } from "@/lib/store/routes";
import { OrderPaidEffects } from "./OrderPaidEffects";
import { PaymentPendingWatch } from "./PaymentPendingWatch";

const PAID_STATUSES: readonly OrderStatus[] = [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

interface Copy {
  title: string;
  lead: string;
}

const copyFor = (order: Wire<PublicOrder>): Copy => {
  if (PAID_STATUSES.includes(order.status)) {
    return { title: "Gracias por tu compra", lead: `Te enviamos el comprobante a ${order.customer.email}.` };
  }
  switch (order.status) {
    case OrderStatus.PENDING_PAYMENT:
      return { title: "Confirmando tu pago…", lead: "" };
    case OrderStatus.CANCELLED:
      return { title: "Este pedido se canceló", lead: "Puedes armar otro desde tu carrito." };
    case OrderStatus.EXPIRED:
      return { title: "Este pedido venció", lead: "Pasaron más de 30 minutos sin recibir el pago. Puedes armar otro desde tu carrito." };
    default:
      return { title: "Este pedido fue reembolsado", lead: "Si tienes dudas, escríbenos y lo revisamos contigo." };
  }
};

/**
 * What `/orden/[publicId]` shows for the status the SERVER reports. Nothing on this page decides that an
 * order is paid: it only reads it (the pending view merely watches until the server changes its answer).
 */
const OrderResult = ({ order }: { order: Wire<PublicOrder> }) => {
  const paid = PAID_STATUSES.includes(order.status);
  const pending = order.status === OrderStatus.PENDING_PAYMENT;
  const { title, lead } = copyFor(order);

  return (
    <StorePass
      tone="mint"
      seal={paid ? "Pagado" : "Admite una"}
      stub={
        <>
          <p className="font-mono text-2xs font-bold uppercase tracking-wide text-text-muted">Total</p>
          <p className="font-display text-4xl leading-none">{formatPesos(order.total)}</p>
          {paid ? (
            <Link href={STORE_ROUTES.shop} className={buttonClassName("primary", "md", "w-full")}>
              Seguir comprando
            </Link>
          ) : (
            <Link href={STORE_ROUTES.shop} className={buttonClassName("edit", "md", "w-full")}>
              Ir a la tienda
            </Link>
          )}
          <Link href={STORE_ROUTES.orders} className={buttonClassName("edit", "md", "w-full")}>
            Ver mis pedidos
          </Link>
        </>
      }
    >
      <header className="mb-6 grid gap-2">
        <span className={T_ORDER_NUMBER}>{order.orderNumber}</span>
        <h2 className={T_PASS_TITLE}>{title}</h2>
        {lead ? <p className="text-text-secondary">{lead}</p> : null}
        <div>
          <StatusChip status={order.status} />
        </div>
      </header>
      {pending ? (
        <PaymentPendingWatch publicId={order.publicId} />
      ) : (
        <div className="grid gap-6">
          {paid ? <OrderPaidEffects /> : null}
          <OrderLines order={order} />
          {paid ? (
            <div className="border-t-2 border-dashed border-ink pt-6">
              <OrderShippingInfo order={order} />
            </div>
          ) : null}
        </div>
      )}
    </StorePass>
  );
};

export { OrderResult };
