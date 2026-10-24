"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_PILL, NAV_PILL_CURRENT, NAV_PILL_TONES, type NavPillTone } from "./navPill";

interface NavLinkProps {
  href: string;
  children: ReactNode;
  onNavigate?: () => void;
  tone?: NavPillTone;
}

/** Pill link of the navbar. The current section (`aria-current`) takes the skin's "current" fill. */
const NavLink = ({ href, children, onNavigate, tone = "lila" }: NavLinkProps) => {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className={`${NAV_PILL} ${NAV_PILL_CURRENT} ${NAV_PILL_TONES[tone]} px-4 md:px-5`}
    >
      {children}
    </Link>
  );
};

export type { NavLinkProps };
export { NavLink };
