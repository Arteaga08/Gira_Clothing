"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useResendVerification } from "@/hooks/useResendVerification";
import { emailError } from "@/lib/auth/validation";
import type { AuthPhoto } from "@/lib/store/authPhoto";
import { STORE_ROUTES } from "@/lib/store/routes";
import { AuthTicket } from "./AuthTicket";
import { ResendButton } from "./ResendButton";

interface InvalidLinkPanelProps {
  photo: AuthPhoto | null;
  /** `verify`: the link can be re-requested by email here. `reset`: the visitor starts again from «Olvidé mi contraseña». */
  kind: "verify" | "reset";
}

const VerifyResend = () => {
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const resend = useResendVerification(email.trim());

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = emailError(email);
    setProblem(message);
    if (!message) void resend.resend();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-[26rem] flex-col gap-4">
      <Field
        label="Correo de tu cuenta"
        type="email"
        autoComplete="email"
        placeholder="maria.lopez@correo.mx"
        value={email}
        error={problem ?? undefined}
        onChange={(event) => setEmail(event.target.value)}
      />
      {resend.error ? (
        <Notice variant="danger" title="No pudimos enviarlo">
          {resend.error}
        </Notice>
      ) : null}
      {resend.sent ? (
        <Notice variant="info" title="Revisa tu correo">
          Si la cuenta existe y falta verificarla, te enviamos un enlace nuevo.
        </Notice>
      ) : null}
      {resend.cooldown.active ? (
        <ResendButton resend={resend} />
      ) : (
        <Button type="submit" variant="primary" loading={resend.pending}>
          Pedir un enlace nuevo
        </Button>
      )}
    </form>
  );
};

/** The emailed link is expired, used or mangled. The two links have different remedies. */
const InvalidLinkPanel = ({ photo, kind }: InvalidLinkPanelProps) => (
  <AuthTicket title="Este enlace ya no sirve" stubLabel="Sin enlace" tone="pink" photo={photo}>
    {kind === "verify" ? (
      <div className="flex flex-col gap-4">
        <p className="max-w-[44ch]">Los enlaces de verificación duran 24 horas y se usan una sola vez. Pide uno nuevo con el correo de tu cuenta.</p>
        <VerifyResend />
      </div>
    ) : (
      <div className="flex max-w-[30rem] flex-col gap-4">
        <p>Los enlaces para cambiar la contraseña duran 1 hora y se usan una sola vez. Pide uno nuevo desde el correo más reciente.</p>
        <Link href={STORE_ROUTES.forgotPassword} className={buttonClassName("primary", "md", "w-full")}>
          Pedir un enlace nuevo
        </Link>
      </div>
    )}
  </AuthTicket>
);

export { InvalidLinkPanel };
