"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ACCOUNT_NAV_ITEMS, isNavItemActive } from "./accountNavItems";

const ITEM_BASE = "rounded-nb-sm border-2 px-3 py-2.5 text-sm font-medium";

/** Sidebar links of «Mi cuenta». The active section is marked with `aria-current` and the accent fill. */
const AccountNav = () => {
  const pathname = usePathname();

  return (
    <nav aria-label="Mi cuenta" className="grid gap-1">
      {ACCOUNT_NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.id}
            href={item.href}
            {...(active ? { "aria-current": "page" as const } : {})}
            className={cn(ITEM_BASE, active ? "border-ink bg-accent font-bold" : "border-transparent hover:bg-surface-raised")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

export { AccountNav };
