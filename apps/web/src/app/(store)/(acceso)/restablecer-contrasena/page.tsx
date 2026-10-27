import type { Metadata } from "next";
import { ResetFlow } from "@/components/store/account/auth/ResetFlow";
import { getAuthPhoto } from "@/lib/store/authPhoto";
import { parseToken } from "@/lib/store/linkToken";

const metadata: Metadata = { title: "Restablecer contraseña" };

interface ResetPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

/** `/restablecer-contrasena?token=`. The route's headers (no-referrer, no-store) live in next.config.ts. */
const ResetPasswordPage = async ({ searchParams }: ResetPageProps) => {
  const [params, photo] = await Promise.all([searchParams, getAuthPhoto()]);
  return <ResetFlow token={parseToken(params.token)} photo={photo} />;
};

export { metadata };
export default ResetPasswordPage;
