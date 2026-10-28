import type { Metadata } from "next";
import { BillingSection } from "@/components/store/account/billing/BillingSection";
import { AccountHeading } from "@/components/store/account/shell/AccountHeading";
import { AccountShell } from "@/components/store/account/shell/AccountShell";
import { AccountUnavailable } from "@/components/store/account/shell/AccountUnavailable";
import { BackToAccount } from "@/components/store/account/shell/BackToAccount";
import { LoadFailure } from "@/components/store/account/shell/LoadFailure";
import { getAccount } from "@/lib/api/accountServer";
import { requireCustomer } from "@/lib/account/requireCustomer";
import { STORE_ROUTES } from "@/lib/store/routes";

const metadata: Metadata = { title: "Facturación", robots: { index: false, follow: false } };

/** `/cuenta/facturacion`: the customer's tax data, kept for a future invoice. */
const BillingPage = async () => {
  const guard = await requireCustomer(STORE_ROUTES.billing);
  if (guard.kind === "unavailable") return <AccountUnavailable />;

  const account = await getAccount();

  return (
    <AccountShell firstName={guard.user.firstName}>
      <BackToAccount />
      <AccountHeading title="Facturación" lead="Tus datos fiscales, guardados para cuando los necesites." />
      {account.status === "ok" ? <BillingSection initialBilling={account.account.billing} /> : <LoadFailure what="tus datos fiscales" />}
    </AccountShell>
  );
};

export { metadata };
export default BillingPage;
