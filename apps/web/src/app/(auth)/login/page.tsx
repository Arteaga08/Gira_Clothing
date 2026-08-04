import type { Metadata } from "next";
import { UserRole } from "@gira/shared";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { Card } from "@/components/ui/Card";
import { T_BRAND_LOCKUP } from "@/components/ui/typography";
import { loadSession } from "@/lib/api/session";

const metadata: Metadata = { title: "Iniciar sesión" };

/**
 * Server Component: resolves the session before rendering anything, so an
 * already-authenticated admin lands on the panel instead of seeing a
 * pointless login form. `(admin)/layout.tsx` guards everything past login;
 * this is the one place before it that needs the same check in reverse.
 */
const LoginPage = async () => {
  const session = await loadSession();
  if (session.kind === "authenticated" && session.user.role === UserRole.ADMIN) {
    redirect("/resumen");
  }

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="grid h-9 w-9 place-items-center rounded-nb-sm border-2 border-ink bg-brand text-sm font-extrabold text-text-inverse">
          G
        </span>
        <h1 className={T_BRAND_LOCKUP}>Panel Gira</h1>
        <p className="text-xs text-text-muted">Inicia sesión para continuar.</p>
      </div>
      <LoginForm />
    </Card>
  );
};

export { metadata };
export default LoginPage;
