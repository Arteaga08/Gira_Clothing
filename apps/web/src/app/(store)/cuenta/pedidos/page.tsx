import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyOrders } from "@/components/store/account/orders/EmptyOrders";
import { OrderRow } from "@/components/store/account/orders/OrderRow";
import { OrdersPager } from "@/components/store/account/orders/OrdersPager";
import { AccountHeading } from "@/components/store/account/shell/AccountHeading";
import { AccountShell } from "@/components/store/account/shell/AccountShell";
import { AccountUnavailable } from "@/components/store/account/shell/AccountUnavailable";
import { BackToAccount } from "@/components/store/account/shell/BackToAccount";
import { LoadFailure } from "@/components/store/account/shell/LoadFailure";
import { ORDERS_PAGE_SIZE, getMyOrders } from "@/lib/api/accountServer";
import { requireCustomer } from "@/lib/account/requireCustomer";
import { STORE_ROUTES } from "@/lib/store/routes";

const metadata: Metadata = { title: "Mis pedidos", robots: { index: false, follow: false } };

interface OrdersPageProps {
  searchParams: Promise<{ pagina?: string | string[] }>;
}

/** `?pagina=` as a positive integer; anything else (missing, repeated, negative, text) is page 1. */
const parsePage = (raw: string | string[] | undefined): number => {
  if (typeof raw !== "string" || !/^[1-9]\d{0,5}$/.test(raw)) return 1;
  return Number(raw);
};

/** `/cuenta/pedidos`: the customer's orders, newest first, ten per page. */
const OrdersPage = async ({ searchParams }: OrdersPageProps) => {
  const page = parsePage((await searchParams).pagina);
  const returnPath = page === 1 ? STORE_ROUTES.orders : `${STORE_ROUTES.orders}?pagina=${String(page)}`;
  const guard = await requireCustomer(returnPath);
  if (guard.kind === "unavailable") return <AccountUnavailable />;

  const result = await getMyOrders(page);
  // A stale or typed page number past the end: land on the last page instead of an empty list with a pager.
  if (result.status === "ok" && result.meta.total > 0 && page > result.meta.pages) {
    redirect(result.meta.pages <= 1 ? STORE_ROUTES.orders : `${STORE_ROUTES.orders}?pagina=${String(result.meta.pages)}`);
  }

  return (
    <AccountShell firstName={guard.user.firstName}>
      <BackToAccount />
      <AccountHeading title="Mis pedidos" />
      {result.status === "error" ? (
        <LoadFailure what="tus pedidos" />
      ) : result.meta.total === 0 ? (
        <EmptyOrders />
      ) : (
        <>
          <ul className="divide-y-2 divide-dashed divide-border border-t-2 border-dashed border-ink">
            {result.orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </ul>
          <OrdersPager page={result.meta.page} limit={ORDERS_PAGE_SIZE} total={result.meta.total} />
        </>
      )}
    </AccountShell>
  );
};

export { metadata };
export default OrdersPage;
