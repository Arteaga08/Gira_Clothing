import { ProhibitIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import { LogoutButton } from "./LogoutButton";

/**
 * Rendered when `GET /auth/me` succeeds but the account isn't an admin — a
 * `customer` with an otherwise valid session. Deliberately not the login
 * screen: the problem here is the wrong role, not a missing session, so
 * redirecting to `/login` would just bounce the same account right back.
 */
const ForbiddenScreen = () => (
  <div className="flex min-h-dvh items-center justify-center p-4">
    <EmptyState
      icon={ProhibitIcon}
      title="Sin acceso"
      description="Tu cuenta no tiene acceso al panel administrativo."
      action={<LogoutButton />}
    />
  </div>
);

export { ForbiddenScreen };
