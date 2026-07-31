import type { PublicUser, Wire } from "@gira/shared";
import { LogoutButton } from "./LogoutButton";

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

interface SidebarFooterProps {
  user: Wire<PublicUser>;
}

const SidebarFooter = ({ user }: SidebarFooterProps) => (
  <div className="border-t-2 border-ink p-3">
    <div className="flex items-center gap-3 rounded-nb-sm border-2 border-ink bg-surface p-2 shadow-nb-sm">
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-nb-sm border-[1.5px] border-ink bg-brand-subtle text-xs font-extrabold">
        {initialsOf(user.name)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold">{user.name}</span>
        <span className="block text-xs text-text-muted">
          Administrador · 2FA {user.twoFactorEnabled ? "activo" : "inactivo"}
        </span>
      </span>
    </div>
    <div className="mt-2">
      <LogoutButton />
    </div>
  </div>
);

export { SidebarFooter };
export type { SidebarFooterProps };
