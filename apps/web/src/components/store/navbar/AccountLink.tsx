import { NavLink } from "./NavLink";
import { STORE_ROUTES } from "@/lib/store/routes";

interface AccountLinkProps {
  authenticated: boolean;
  onNavigate?: () => void;
}

/** «Iniciar sesión» for a visitor, «Mi cuenta» once there is a session. */
const AccountLink = ({ authenticated, onNavigate }: AccountLinkProps) => (
  <NavLink href={authenticated ? STORE_ROUTES.account : STORE_ROUTES.login} {...(onNavigate ? { onNavigate } : {})}>
    {authenticated ? "Mi cuenta" : "Iniciar sesión"}
  </NavLink>
);

export type { AccountLinkProps };
export { AccountLink };
