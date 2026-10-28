import type { ReactNode } from "react";
import { AccountNav } from "./AccountNav";
import { LogoutButton } from "./LogoutButton";

/**
 * «Mi cuenta» as ONE bone card: sidebar and content split by an ink rule, no nested cards. On a
 * phone the sidebar disappears (the summary becomes a grid of tiles and each section carries
 * a «< Mi cuenta» link).
 */
const AccountShell = ({ firstName, children }: { firstName: string; children: ReactNode }) => (
  <div className="mx-auto w-full max-w-[72rem] px-4 pb-14 pt-6 md:px-8">
    <div className="grid overflow-hidden rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb-lg lg:grid-cols-[248px_1fr]">
      <aside className="hidden flex-col gap-3 border-r-2 border-ink p-4 lg:flex">
        <div className="px-2 pb-2">
          <span className="font-mono text-2xs font-bold uppercase tracking-wide text-text-muted">Mi cuenta</span>
          <b className="block font-display text-2xl font-normal uppercase leading-none">{firstName}</b>
        </div>
        <AccountNav />
        <div className="mt-2 border-t-2 border-dashed border-ink pt-3">
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 px-5 py-6 md:px-10 md:py-8">{children}</div>
    </div>
  </div>
);

export { AccountShell };
