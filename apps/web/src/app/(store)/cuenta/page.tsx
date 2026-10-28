import type { Metadata } from "next";
import { AccountDetailsPanel } from "@/components/store/account/overview/AccountDetailsPanel";
import { AccountTiles } from "@/components/store/account/overview/AccountTiles";
import { LastOrderPanel } from "@/components/store/account/overview/LastOrderPanel";
import { AccountHeading } from "@/components/store/account/shell/AccountHeading";
import { AccountShell } from "@/components/store/account/shell/AccountShell";
import { AccountUnavailable } from "@/components/store/account/shell/AccountUnavailable";
import { LoadFailure } from "@/components/store/account/shell/LoadFailure";
import { getMyOrders } from "@/lib/api/accountServer";
import { requireCustomer } from "@/lib/account/requireCustomer";
import { STORE_ROUTES } from "@/lib/store/routes";

const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };

const ordersSummary = (total: number): string => {
  if (total === 0) return "Aún sin pedidos";
  return total === 1 ? "1 pedido" : `${String(total)} pedidos`;
};

/**
 * `/cuenta`, the summary: greeting, the newest order and the account's identity. The name and
 * email come from the session itself; only the last order costs an extra read, and its failure
 * stays inside its own panel.
 */
const AccountSummaryPage = async () => {
  const guard = await requireCustomer(STORE_ROUTES.account);
  if (guard.kind === "unavailable") return <AccountUnavailable />;

  const { user } = guard;
  const orders = await getMyOrders(1, 1);

  return (
    <AccountShell firstName={user.firstName}>
      <AccountHeading title={`Hola, ${user.firstName}`} lead="Esto es lo que pasa con tu cuenta hoy." />
      <div className="grid gap-8 border-t-2 border-dashed border-ink pt-6 lg:grid-cols-[3fr_2fr] lg:gap-0">
        <div className="lg:pr-8">
          {orders.status === "ok" ? <LastOrderPanel order={orders.orders[0] ?? null} /> : <LoadFailure what="tu último pedido" />}
        </div>
        <div className="border-t-2 border-dashed border-ink pt-6 lg:border-l-2 lg:border-t-0 lg:pl-8 lg:pt-0">
          <AccountDetailsPanel firstName={user.firstName} lastName={user.lastName} email={user.email} />
        </div>
      </div>
      <AccountTiles
        summaries={{
          ...(orders.status === "ok" ? { orders: ordersSummary(orders.meta.total) } : {}),
          profile: user.email,
        }}
      />
    </AccountShell>
  );
};

export { metadata };
export default AccountSummaryPage;
