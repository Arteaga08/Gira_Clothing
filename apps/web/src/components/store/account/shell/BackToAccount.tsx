import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { STORE_ROUTES } from "@/lib/store/routes";

/** «< Mi cuenta», phone only: there the sidebar is gone, so every section needs its way back. */
const BackToAccount = () => (
  <Link href={STORE_ROUTES.account} className="mb-4 inline-flex items-center gap-1 text-sm font-bold underline-offset-4 hover:underline lg:hidden">
    <CaretLeft aria-hidden="true" weight="bold" />
    Mi cuenta
  </Link>
);

export { BackToAccount };
