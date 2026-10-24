"use client";

import { useCartCount } from "@/hooks/useCartCount";
import { STORE_ROUTES } from "@/lib/store/routes";
import { NavLink } from "./NavLink";

interface CartLinkProps {
  authenticated: boolean;
}

/** «Carrito (n)». The count is counted data, so it is set in the mono face (DESIGN.md). */
const CartLink = ({ authenticated }: CartLinkProps) => {
  const count = useCartCount(authenticated);
  const label = count === 1 ? "1 artículo" : `${count} artículos`;

  return (
    <NavLink tone="rosa" href={STORE_ROUTES.cart}>
      <span aria-hidden="true">Carrito</span>{" "}
      <span aria-hidden="true" className="ml-1.5 font-mono tabular-nums">
        ({count})
      </span>
      <span className="sr-only">Carrito, {label}</span>
    </NavLink>
  );
};

export type { CartLinkProps };
export { CartLink };
