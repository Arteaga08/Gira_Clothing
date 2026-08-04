"use client";

import type { PublicUser, Wire } from "@gira/shared";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { T_BRAND_LOCKUP } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { NAV_GROUPS } from "@/lib/navigation";
import { useMobileNav } from "./MobileNavProvider";
import { NavItem } from "./NavItem";
import { SidebarFooter } from "./SidebarFooter";

interface SidebarProps {
  user: Wire<PublicUser>;
}

/**
 * A second neutral layer, not a card (spec §4): the rail itself carries no
 * hard shadow or radius — only the components inside it do. On mobile it's
 * a drawer (`data-open` drives the transform); from `lg:` up it's sticky and
 * always visible, and the scrim/close affordances are simply unused.
 */
const Sidebar = ({ user }: SidebarProps) => {
  const { open, closeNav } = useMobileNav();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNav();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeNav]);

  return (
    <>
      <div
        data-scrim="true"
        aria-hidden="true"
        onClick={closeNav}
        className={cn(
          "fixed inset-0 z-(--z-scrim) bg-scrim lg:hidden",
          open ? "block" : "hidden",
        )}
      />
      <aside
        id="sidebar"
        data-open={open}
        aria-label="Navegación principal"
        className={cn(
          "fixed inset-y-0 left-0 z-(--z-sidebar) flex w-(--sidebar-width) flex-col text-text-primary",
          "border-r-2 border-ink bg-surface-raised transition-transform ease-drawer",
          open ? "translate-x-0 duration-(--duration-enter)" : "-translate-x-full duration-(--duration-exit)",
          "lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
        )}
      >
        <div className="flex h-[var(--topbar-height)] items-center justify-between border-b-2 border-ink px-4">
          <span className={cn("flex items-center gap-2", T_BRAND_LOCKUP)}>
            <span className="grid h-[30px] w-[30px] place-items-center rounded-nb-sm border-2 border-ink bg-brand text-sm font-extrabold text-text-inverse">
              G
            </span>
            Gira
          </span>
          <IconButton
            icon={XIcon}
            label="Cerrar navegación"
            className="lg:hidden"
            onClick={closeNav}
          />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.key} className="mt-5 first:mt-0">
              <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
                {group.label}
              </p>
              <div role="group" aria-label={group.label} className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavItem key={item.key} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <SidebarFooter user={user} />
      </aside>
    </>
  );
};

export { Sidebar };
export type { SidebarProps };
