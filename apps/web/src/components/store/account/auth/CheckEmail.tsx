"use client";

import { useEffect } from "react";
import { Notice } from "@/components/ui/Notice";
import { useResendVerification } from "@/hooks/useResendVerification";
import type { AuthPhoto } from "@/lib/store/authPhoto";
import { AuthTicket } from "./AuthTicket";
import { ResendButton } from "./ResendButton";

interface CheckEmailProps {
  email: string;
  photo: AuthPhoto | null;
  /** Back to the signup form to fix a typo in the address. */
  onUseOther: () => void;
}

/**
 * «Revisa tu correo» after signup. Registration does not log in: the first link was just
 * sent, so the wait before another one starts at once, and its countdown lives on the stub.
 */
const CheckEmail = ({ email, photo, onUseOther }: CheckEmailProps) => {
  const resend = useResendVerification(email);
  const { start } = resend.cooldown;

  useEffect(() => {
    start();
  }, [start]);

  return (
    <AuthTicket
      title="Revisa tu correo"
      stubLabel="Ya casi"
      tone="mint"
      photo={photo}
      stubExtra={
        <div className="absolute inset-x-5 top-[42%] grid gap-0.5 rounded-nb border-2 border-ink bg-surface p-4 text-center text-text-primary shadow-nb max-md:inset-x-auto max-md:right-3 max-md:top-3 max-md:w-[46%] max-md:p-2">
          <b className="font-display text-5xl font-normal leading-none max-md:text-4xl">{resend.cooldown.active ? resend.cooldown.label : "0:00"}</b>
          <span className="font-mono text-2xs font-bold uppercase">para reenviar</span>
          <span className="font-mono text-2xs font-bold uppercase max-md:hidden">El enlace vence en 24 h</span>
        </div>
      }
    >
      <div className="flex max-w-[30rem] flex-col gap-4">
        <p>
          Enviamos un enlace de verificación a <strong>{email}</strong>. Ábrelo y escribe tu contraseña para activar la cuenta; vence en 24 horas.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <ResendButton resend={resend} />
          <button type="button" onClick={onUseOther} className="text-sm font-bold underline underline-offset-4">
            Usar otro correo
          </button>
        </div>
        {resend.sent ? (
          <Notice variant="info" title="Listo">
            Pedimos un enlace nuevo. El anterior ya no sirve.
          </Notice>
        ) : null}
        {resend.error ? (
          <Notice variant="danger" title="No pudimos reenviarlo">
            {resend.error}
          </Notice>
        ) : null}
        <p className="text-sm text-text-secondary">Puedes pedir otro enlace cada minuto. Revisa también tu carpeta de spam.</p>
      </div>
    </AuthTicket>
  );
};

export { CheckEmail };
