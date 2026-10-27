import type { Metadata } from "next";
import { ForgotFlow } from "@/components/store/account/auth/ForgotFlow";
import { getAuthPhoto } from "@/lib/store/authPhoto";

const metadata: Metadata = { title: "Recuperar contraseña" };

const ForgotPasswordPage = async () => <ForgotFlow photo={await getAuthPhoto()} />;

export { metadata };
export default ForgotPasswordPage;
