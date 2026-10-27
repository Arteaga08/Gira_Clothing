import type { Metadata } from "next";
import { VerifyFlow } from "@/components/store/account/auth/VerifyFlow";
import { getAuthPhoto } from "@/lib/store/authPhoto";
import { parseToken } from "@/lib/store/linkToken";

const metadata: Metadata = { title: "Verificar correo" };

interface VerifyPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

/** `/verificar-correo?token=`. The route's headers (no-referrer, no-store) live in next.config.ts. */
const VerifyEmailPage = async ({ searchParams }: VerifyPageProps) => {
  const [params, photo] = await Promise.all([searchParams, getAuthPhoto()]);
  return <VerifyFlow token={parseToken(params.token)} photo={photo} />;
};

export { metadata };
export default VerifyEmailPage;
