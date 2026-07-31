import { UserRole } from "@gira/shared";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { ForbiddenScreen } from "@/components/shell/ForbiddenScreen";
import { SessionUnavailableScreen } from "@/components/shell/SessionUnavailableScreen";
import { loadSession } from "@/lib/api/session";

/**
 * Guards every route under `(admin)`, server-side against `GET /auth/me`
 * (spec §6) — not `middleware.ts`. This layout already needs the user's
 * role to tell a customer's 403 apart from an anonymous visitor's 401, and
 * middleware can redirect but can't render the "no access" screen the 403
 * case needs; fetching `/auth/me` twice (once in middleware, once here) to
 * get the same answer isn't worth avoiding one round trip.
 *
 * Order matters: `unavailable` is checked before `anonymous`. A downed API
 * is not the same thing as "not logged in", and sending it to `/login`
 * would show a form that can't work either way while misstating why.
 */
const AdminLayout = async ({ children }: { children: ReactNode }) => {
  const session = await loadSession();

  if (session.kind === "unavailable") {
    return <SessionUnavailableScreen message={session.message} />;
  }
  if (session.kind === "anonymous") {
    redirect("/login");
  }
  if (session.user.role !== UserRole.ADMIN) {
    return <ForbiddenScreen />;
  }

  return <AdminShell user={session.user}>{children}</AdminShell>;
};

export default AdminLayout;
