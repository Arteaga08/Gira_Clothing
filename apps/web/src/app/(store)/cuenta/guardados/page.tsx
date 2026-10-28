import type { Metadata } from "next";
import { AccountHeading } from "@/components/store/account/shell/AccountHeading";
import { AccountShell } from "@/components/store/account/shell/AccountShell";
import { AccountUnavailable } from "@/components/store/account/shell/AccountUnavailable";
import { BackToAccount } from "@/components/store/account/shell/BackToAccount";
import { LoadFailure } from "@/components/store/account/shell/LoadFailure";
import { SavedGrid } from "@/components/store/wishlist/SavedGrid";
import { requireCustomer } from "@/lib/account/requireCustomer";
import { getSavedItems } from "@/lib/api/wishlistServer";
import { STORE_ROUTES } from "@/lib/store/routes";

const metadata: Metadata = { title: "Guardados", robots: { index: false, follow: false } };

/**
 * «Guardados» (wishlist) inside «Mi cuenta»: the saved prints of the signed-in customer with their
 * live price and stock notice. Account area, so no indexing; the guard sends a visitor to the login
 * (keeping the way back) and an admin to the panel. Three states: with items, empty, load error.
 */
const SavedPage = async () => {
  const guard = await requireCustomer(STORE_ROUTES.saved);
  if (guard.kind === "unavailable") return <AccountUnavailable />;

  const saved = await getSavedItems();

  return (
    <AccountShell firstName={guard.user.firstName}>
      <BackToAccount />
      <AccountHeading title="Guardados" lead="Las prendas que te gustaron, con su precio de hoy." />
      {saved.status === "ok" ? <SavedGrid initialItems={saved.items} /> : <LoadFailure what="tus guardados" />}
    </AccountShell>
  );
};

export { metadata };
export default SavedPage;
