import { UserRole } from "@gira/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterFlow } from "@/components/store/account/auth/RegisterFlow";
import { loadSession } from "@/lib/api/session";
import { getAuthPhoto } from "@/lib/store/authPhoto";
import { resolveRedirect } from "@/lib/store/safeRedirect";

const metadata: Metadata = { title: "Crear cuenta" };

interface RegisterPageProps {
  searchParams: Promise<{ redirect?: string | string[] }>;
}

const RegisterPage = async ({ searchParams }: RegisterPageProps) => {
  const redirectTo = resolveRedirect((await searchParams).redirect);
  const [session, photo] = await Promise.all([loadSession(), getAuthPhoto()]);
  if (session.kind === "authenticated" && session.user.role === UserRole.CUSTOMER) redirect(redirectTo);

  return <RegisterFlow redirectTo={redirectTo} photo={photo} />;
};

export { metadata };
export default RegisterPage;
