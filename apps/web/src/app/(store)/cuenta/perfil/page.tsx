import type { Metadata } from "next";
import { ProfileSection } from "@/components/store/account/profile/ProfileSection";
import { AccountHeading } from "@/components/store/account/shell/AccountHeading";
import { AccountShell } from "@/components/store/account/shell/AccountShell";
import { AccountUnavailable } from "@/components/store/account/shell/AccountUnavailable";
import { BackToAccount } from "@/components/store/account/shell/BackToAccount";
import { LoadFailure } from "@/components/store/account/shell/LoadFailure";
import { getAccountProfile } from "@/lib/api/accountServer";
import { requireCustomer } from "@/lib/account/requireCustomer";
import { STORE_ROUTES } from "@/lib/store/routes";

const metadata: Metadata = { title: "Perfil", robots: { index: false, follow: false } };

/** `/cuenta/perfil`: personal data, password and sessions. */
const ProfilePage = async () => {
  const guard = await requireCustomer(STORE_ROUTES.profile);
  if (guard.kind === "unavailable") return <AccountUnavailable />;

  const account = await getAccountProfile();

  return (
    <AccountShell firstName={guard.user.firstName}>
      <BackToAccount />
      <AccountHeading title="Perfil" lead="Tus datos y la seguridad de tu cuenta." />
      {account.status === "ok" ? <ProfileSection initialProfile={account.profile} /> : <LoadFailure what="tu perfil" />}
    </AccountShell>
  );
};

export { metadata };
export default ProfilePage;
