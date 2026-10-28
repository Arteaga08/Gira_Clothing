import Link from "next/link";
import { LogoutButton } from "../shell/LogoutButton";
import { ACCOUNT_NAV_ITEMS } from "../shell/accountNavItems";

interface AccountTilesProps {
  /** One-line summary per section id (orders count, email…); a section without one shows an empty line. */
  summaries: Partial<Record<(typeof ACCOUNT_NAV_ITEMS)[number]["id"], string>>;
}

const TILE = "block rounded-nb border-2 border-ink p-3.5";

/** Phone-only grid that replaces the sidebar: one tile per section with its summary, and the sign-out. */
const AccountTiles = ({ summaries }: AccountTilesProps) => (
  <div className="mt-6 grid grid-cols-2 gap-3 lg:hidden">
    {ACCOUNT_NAV_ITEMS.filter((item) => item.id !== "summary").map((item) => (
      <Link key={item.id} href={item.href} className={`${TILE} bg-surface-raised`}>
        <b className="block text-sm">{item.label}</b>
        <span className="block min-h-4 truncate text-xs text-text-secondary">{summaries[item.id] ?? ""}</span>
      </Link>
    ))}
    <LogoutButton tile />
  </div>
);

export { AccountTiles };
