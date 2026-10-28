import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetailView } from "@/components/store/account/orders/OrderDetailView";
import { AccountShell } from "@/components/store/account/shell/AccountShell";
import { AccountUnavailable } from "@/components/store/account/shell/AccountUnavailable";
import { LoadFailure } from "@/components/store/account/shell/LoadFailure";
import { getMyOrder } from "@/lib/api/accountServer";
import { requireCustomer } from "@/lib/account/requireCustomer";
import { isOrderId } from "@/lib/orders/orderId";
import { orderRoute } from "@/lib/store/routes";

const metadata: Metadata = { title: "Pedido", robots: { index: false, follow: false } };

interface OrderPageProps {
  params: Promise<{ id: string }>;
}

/** `/cuenta/pedidos/[id]`: one order of the signed-in customer. A malformed id or someone else's order is a 404. */
const OrderPage = async ({ params }: OrderPageProps) => {
  const { id } = await params;
  if (!isOrderId(id)) notFound();

  const guard = await requireCustomer(orderRoute(id));
  if (guard.kind === "unavailable") return <AccountUnavailable />;

  const result = await getMyOrder(id);
  if (result.status === "not-found") notFound();

  return (
    <AccountShell firstName={guard.user.firstName}>
      {result.status === "ok" ? <OrderDetailView order={result.order} /> : <LoadFailure what="este pedido" />}
    </AccountShell>
  );
};

export { metadata };
export default OrderPage;
