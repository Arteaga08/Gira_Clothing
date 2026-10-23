import Link from "next/link";
import { STORE_ROUTES } from "@/lib/store/routes";

/**
 * GIRA wordmark, centred. It is the largest thing in the bar and shrinks with
 * a transform (never font-size), so the compact state costs no layout shift.
 * The parent header carries `group/header` and `data-scrolled`.
 */
const NavLogo = () => (
  <Link
    href={STORE_ROUTES.home}
    aria-label="Gira Clothing, inicio"
    className="inline-block origin-center font-display text-[length:var(--store-logo-size)] uppercase leading-none tracking-[0.04em] transition-transform duration-300 ease-[var(--store-nav-ease)] group-data-[scrolled=true]/header:scale-[var(--store-logo-scale-scrolled)] motion-reduce:transition-none"
  >
    Gira
  </Link>
);

export { NavLogo };
