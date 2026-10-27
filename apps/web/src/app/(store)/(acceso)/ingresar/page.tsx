import { UserRole } from "@gira/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomerLoginForm } from "@/components/store/account/auth/CustomerLoginForm";
import { loadSession } from "@/lib/api/session";
import { getAuthPhoto } from "@/lib/store/authPhoto";
import { resolveRedirect } from "@/lib/store/safeRedirect";

const metadata: Metadata = { title: "Ingresar" };

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string | string[] }>;
}

/** `/ingresar`. A customer who is already in goes straight to where they were headed. */
const LoginPage = async ({ searchParams }: LoginPageProps) => {
  const redirectTo = resolveRedirect((await searchParams).redirect);
  const [session, photo] = await Promise.all([loadSession(), getAuthPhoto()]);
  if (session.kind === "authenticated" && session.user.role === UserRole.CUSTOMER) redirect(redirectTo);

  return <CustomerLoginForm redirectTo={redirectTo} photo={photo} />;
};

export { metadata };
export default LoginPage;
