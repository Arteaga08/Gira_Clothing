"use client";

import { Notice } from "@/components/ui/Notice";
import { useResendVerification } from "@/hooks/useResendVerification";
import { ResendButton } from "./ResendButton";

/** Login answered 403: the password was right but the email was never verified. */
const UnverifiedNotice = ({ email }: { email: string }) => {
  const resend = useResendVerification(email);

  return (
    <Notice variant="warning" title="Todavía no verificas tu correo">
      <p>Abre el enlace que te enviamos al crear tu cuenta, o pide uno nuevo.</p>
      <div className="mt-3 flex flex-col items-start gap-2">
        <ResendButton resend={resend} />
        {resend.sent ? <p role="status">Listo, pedimos un enlace nuevo. El anterior ya no sirve.</p> : null}
        {resend.error ? <p role="alert">{resend.error}</p> : null}
      </div>
    </Notice>
  );
};

export { UnverifiedNotice };
