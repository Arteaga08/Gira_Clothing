"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useSubmit } from "@/hooks/useSubmit";
import { forgotPassword } from "@/lib/api/auth";
import { focusFirstInvalid } from "@/lib/auth/focus";
import { emailError } from "@/lib/auth/validation";
import type { AuthPhoto } from "@/lib/store/authPhoto";
import { STORE_ROUTES } from "@/lib/store/routes";
import { AuthTicket } from "./AuthTicket";

/**
 * «Olvidé mi contraseña». The API answers 200 whether or not the address has an account, and so
 * does this screen: it never says which. The link lasts 1 hour.
 */
const ForgotFlow = ({ photo }: { photo: AuthPhoto | null }) => {
  const { pending, error, run } = useSubmit();
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = emailError(email);
    setProblem(message ?? undefined);
    if (message) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    await run(async () => {
      await forgotPassword(email.trim());
      setSentTo(email.trim());
    });
  };

  if (sentTo) {
    return (
      <AuthTicket title="Revisa tu correo" stubLabel="Ya casi" tone="mint" photo={photo}>
        <div className="flex max-w-[30rem] flex-col gap-4">
          <p>
            Si <strong>{sentTo}</strong> tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Vence en 1 hora.
          </p>
          <p className="text-sm text-text-secondary">¿No lo ves? Revisa tu carpeta de spam o vuelve a intentarlo en unos minutos.</p>
          <Link href={STORE_ROUTES.login} className="self-start text-sm font-bold underline underline-offset-4">
            Volver a ingresar
          </Link>
        </div>
      </AuthTicket>
    );
  }

  return (
    <AuthTicket
      title="Recuperar contraseña"
      lead="Escribe el correo de tu cuenta y te enviamos un enlace para crear una nueva."
      stubLabel="Sin pánico"
      tone="lilac"
      photo={photo}
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate aria-busy={pending} className="flex max-w-[26rem] flex-col gap-4">
        <Field
          label="Correo"
          type="email"
          autoComplete="email"
          placeholder="maria.lopez@correo.mx"
          value={email}
          error={problem}
          onChange={(event) => setEmail(event.target.value)}
        />
        {error ? (
          <Notice variant="danger" title="No pudimos enviarlo">
            {error}
          </Notice>
        ) : null}
        <Button type="submit" variant="primary" loading={pending}>
          Enviar enlace
        </Button>
        <Link href={STORE_ROUTES.login} className="self-start text-sm font-bold underline underline-offset-4">
          Volver a ingresar
        </Link>
      </form>
    </AuthTicket>
  );
};

export { ForgotFlow };
