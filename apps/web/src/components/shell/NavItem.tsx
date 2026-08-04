"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { isNavItemActive, type NavItemConfig } from "@/lib/navigation";

/**
 * Sections without a screen yet render disabled — no `<a>`, so they can't be
 * navigated to and don't produce a 404 — instead of being hidden, so the
 * shape of the whole product is visible from M7 onward.
 */
const NavItem = ({ item }: { item: NavItemConfig }) => {
  const pathname = usePathname();

  if (!item.available) {
    return (
      <span
        aria-disabled="true"
        className="flex items-center gap-3 rounded-nb-sm border-l-2 border-transparent px-3 py-2 text-sm text-text-muted"
      >
        <Icon icon={item.icon} className="shrink-0" />
        {item.label}
        <Badge variant="neutral" className="ml-auto text-text-muted">
          Pronto
        </Badge>
      </span>
    );
  }

  const active = isNavItemActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        // A colour change, not a move — plain `ease`, not the strong expo
        // curve reserved for the shadow-press treatment elsewhere.
        "flex items-center gap-3 rounded-nb-sm border-l-2 px-3 py-2 text-sm font-medium transition-colors duration-(--duration-state) ease-in-out",
        active
          ? "border-brand bg-brand-soft font-bold text-brand"
          : "border-transparent text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
      )}
    >
      <Icon icon={item.icon} className="shrink-0" />
      {item.label}
    </Link>
  );
};

export { NavItem };
