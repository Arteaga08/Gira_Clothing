import { redirect } from "next/navigation";
import { UserRole, type PublicUser, type Wire } from "@gira/shared";
import { loadSession } from "@/lib/api/session";
import { STORE_ROUTES, withRedirect } from "@/lib/store/routes";

type CustomerGuard =
  | { kind: "customer"; user: Wire<PublicUser> }
  | { kind: "unavailable"; message: string };

/** Where a staff member who opens «Mi cuenta» belongs: the panel's home. */
const ADMIN_HOME = "/resumen";

/**
 * Guard of every «Mi cuenta» page. It lives in the page, not in a layout, because only the
 * page knows its own path: a visitor lands on the login with `?redirect=` back to it.
 * Staff accounts have no customer area; an API outage is a state the page draws.
 */
const requireCustomer = async (returnPath: string): Promise<CustomerGuard> => {
  const session = await loadSession();
  if (session.kind === "anonymous") redirect(withRedirect(STORE_ROUTES.login, returnPath));
  if (session.kind === "unavailable") return { kind: "unavailable", message: session.message };
  if (session.user.role !== UserRole.CUSTOMER) redirect(ADMIN_HOME);
  return { kind: "customer", user: session.user };
};

export type { CustomerGuard };
export { requireCustomer, ADMIN_HOME };
