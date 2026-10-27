import Link from "next/link";
import { buttonClassName } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

/**
 * The email belongs to the team (the API asked for a second factor or enrolment): the store
 * has no 2FA, so the visitor is sent to the panel's own login instead of a dead end.
 */
const StaffAccountNotice = ({ onUseAnother }: { onUseAnother: () => void }) => (
  <div className="flex flex-col gap-4">
    <Notice variant="info" title="Esta cuenta es del equipo">
      <p>Las cuentas del equipo entran por el panel, con su verificación en dos pasos.</p>
    </Notice>
    <Link href="/login" className={buttonClassName("edit", "md", "w-full")}>
      Ir al panel
    </Link>
    <button type="button" onClick={onUseAnother} className="self-start text-sm font-bold underline underline-offset-4">
      Usar otra cuenta
    </button>
  </div>
);

export { StaffAccountNotice };
