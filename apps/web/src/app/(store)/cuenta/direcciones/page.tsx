import type { Metadata } from "next";
import { AddressesSection } from "@/components/store/account/addresses/AddressesSection";
import { AccountHeading } from "@/components/store/account/shell/AccountHeading";
import { AccountShell } from "@/components/store/account/shell/AccountShell";
import { AccountUnavailable } from "@/components/store/account/shell/AccountUnavailable";
import { BackToAccount } from "@/components/store/account/shell/BackToAccount";
import { LoadFailure } from "@/components/store/account/shell/LoadFailure";
import { getAccount } from "@/lib/api/accountServer";
import { requireCustomer } from "@/lib/account/requireCustomer";
import { STORE_ROUTES } from "@/lib/store/routes";

const metadata: Metadata = { title: "Direcciones", robots: { index: false, follow: false } };

/** `/cuenta/direcciones`: the saved shipping addresses. */
const AddressesPage = async () => {
  const guard = await requireCustomer(STORE_ROUTES.addresses);
  if (guard.kind === "unavailable") return <AccountUnavailable />;

  const account = await getAccount();

  return (
    <AccountShell firstName={guard.user.firstName}>
      <BackToAccount />
      <AccountHeading title="Direcciones" lead="Guárdalas aquí y las tendrás listas al pagar." />
      {account.status === "ok" ? <AddressesSection initialAddresses={account.account.addresses} /> : <LoadFailure what="tus direcciones" />}
    </AccountShell>
  );
};

export { metadata };
export default AddressesPage;
