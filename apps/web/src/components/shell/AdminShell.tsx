import type { PublicUser, Wire } from "@gira/shared";
import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs";
import { CommandPaletteMount } from "./CommandPaletteMount";
import { CommandPaletteProvider } from "./CommandPaletteProvider";
import { MobileNavProvider } from "./MobileNavProvider";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface AdminShellProps {
  user: Wire<PublicUser>;
  children: ReactNode;
}

/**
 * The authenticated admin's frame: sidebar + top bar + breadcrumbs + main
 * column. `CommandPaletteProvider` wraps everything so the ⌘K/Ctrl+K
 * listener (`CommandPaletteMount`) and TopBar's search trigger share one
 * open/close state — the trigger click is meant to be the same event as the
 * shortcut, not a lookalike.
 */
const AdminShell = ({ user, children }: AdminShellProps) => {
  return (
    <MobileNavProvider>
      <CommandPaletteProvider>
        <div className="lg:grid lg:grid-cols-[var(--sidebar-width)_1fr]">
          <Sidebar user={user} />
          <div className="flex min-w-0 flex-col">
            <TopBar />
            <Breadcrumbs />
            <main id="main-content" className="flex-1 p-4 lg:px-6">
              {children}
            </main>
          </div>
        </div>
        <CommandPaletteMount />
      </CommandPaletteProvider>
    </MobileNavProvider>
  );
};

export { AdminShell };
export type { AdminShellProps };
