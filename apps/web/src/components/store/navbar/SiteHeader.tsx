"use client";

import { useEffect, useRef, useState } from "react";
import { STORE_ROUTES } from "@/lib/store/routes";
import { AccountLink } from "./AccountLink";
import { CartLink } from "./CartLink";
import { MobileMenu } from "./MobileMenu";
import { NavLink } from "./NavLink";
import { NavLogo } from "./NavLogo";

interface SiteHeaderProps {
  authenticated: boolean;
}

/**
 * Storefront navbar, fully transparent (no fill, no rule) so the page shows
 * through; its pills carry their own fill. Once the marquee has scrolled away it
 * sticks to the viewport and the logo shrinks. The scroll state comes from an IntersectionObserver on a
 * 1px sentinel (no scroll listener); its height never changes, so nothing
 * below it moves. Layout: «Tienda» left, logo centre, account and cart right.
 */
const SiteHeader = ({ authenticated }: SiteHeaderProps) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setScrolled(!entry.isIntersecting);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="pointer-events-none h-px w-full -mb-px" />
      <header
        data-scrolled={scrolled}
        className="group/header sticky top-0 z-[var(--z-topbar)] h-[var(--store-nav-height)] text-[var(--store-nav-fg)]"
      >
        <div className="mx-auto grid h-full max-w-[90rem] grid-cols-[1fr_auto_1fr] items-center px-4 md:px-8">
          <div className="justify-self-start">
            <div className="hidden md:block">
              <NavLink href={STORE_ROUTES.shop}>Tienda</NavLink>
            </div>
            <MobileMenu authenticated={authenticated} />
          </div>
          <NavLogo />
          <div className="flex items-center gap-6 justify-self-end md:gap-8">
            <div className="hidden md:block">
              <AccountLink authenticated={authenticated} />
            </div>
            <CartLink authenticated={authenticated} />
          </div>
        </div>
      </header>
    </>
  );
};

export type { SiteHeaderProps };
export { SiteHeader };
