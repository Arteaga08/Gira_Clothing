import Link from "next/link";
import { buttonClassName } from "@/components/ui/Button";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { STORE_ROUTES } from "@/lib/store/routes";

/** «Tu cuenta» of the summary: who the account belongs to and the way to edit it. */
interface AccountDetailsPanelProps {
  firstName: string;
  lastName: string;
  email: string;
}

const AccountDetailsPanel = ({ firstName, lastName, email }: AccountDetailsPanelProps) => (
  <section aria-labelledby="account-details-title">
    <h2 id="account-details-title" className={`${T_PANEL_TITLE} mb-4 text-2xl`}>
      Tu cuenta
    </h2>
    <dl className="grid gap-2.5">
      <div className="flex justify-between gap-3 border-b-2 border-dashed border-border pb-2">
        <dt className="text-text-muted">Nombre</dt>
        <dd className="m-0 text-right font-bold">{`${firstName} ${lastName}`}</dd>
      </div>
      <div className="flex justify-between gap-3 border-b-2 border-dashed border-border pb-2">
        <dt className="text-text-muted">Correo</dt>
        <dd className="m-0 min-w-0 break-words text-right font-bold">{email}</dd>
      </div>
    </dl>
    <Link href={STORE_ROUTES.profile} className={buttonClassName("edit", "sm", "mt-5")}>
      Editar perfil
    </Link>
  </section>
);

export { AccountDetailsPanel };
