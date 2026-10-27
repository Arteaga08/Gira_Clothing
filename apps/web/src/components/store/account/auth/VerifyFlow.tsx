"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useSubmit } from "@/hooks/useSubmit";
import { isApiError } from "@/lib/api/ApiError";
import { verifyEmail } from "@/lib/api/auth";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { focusFirstInvalid } from "@/lib/auth/focus";
import type { AuthPhoto } from "@/lib/store/authPhoto";
import { STORE_ROUTES } from "@/lib/store/routes";
import { AuthTicket } from "./AuthTicket";
import { InvalidLinkPanel } from "./InvalidLinkPanel";
import { PasswordField } from "./PasswordField";

interface VerifyFlowProps {
  /** The 64-hex token from the link, or null when it was missing or malformed. */
  token: string | null;
  photo: AuthPhoto | null;
}

const WRONG_PASSWORD_MESSAGE = "Esa no es la contraseña de tu cuenta. Revísala e inténtalo de nuevo.";

/**
 * `/verificar-correo`. The API asks for the password chosen at signup along with the token, so
 * someone who registered another person's address cannot get it verified when its owner clicks
 * the link. It does not log in: the visitor goes on to «Ingresar».
 */
const VerifyFlow = ({ token, photo }: VerifyFlowProps) => {
  const { pending, error, setError, run } = useSubmit();
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState<string | undefined>(undefined);
  const [view, setView] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");

  if (view === "invalid" || !token) return <InvalidLinkPanel photo={photo} kind="verify" />;

  if (view === "done") {
    return (
      <AuthTicket title="Cuenta verificada" lead="Tu correo quedó confirmado. Ya puedes entrar con tu contraseña." stubLabel="¡Listo!" tone="mint" photo={photo}>
        <Link href={STORE_ROUTES.login} className={buttonClassName("primary", "md", "w-full max-w-[26rem]")}>
          Ingresar
        </Link>
      </AuthTicket>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password === "") {
      setMissing("Escribe tu contraseña.");
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setMissing(undefined);
    await run(
      async () => {
        await verifyEmail({ token, password });
        setView("done");
      },
      {
        // A wrong password is a 401 that does NOT burn the link; any other 4xx means the link itself is dead.
        onError: (failure) => {
          if (isApiError(failure) && failure.kind === "http" && failure.status === 400) {
            setView("invalid");
            return;
          }
          setError(authFailureMessage(failure, { unauthorized: WRONG_PASSWORD_MESSAGE }));
        },
      },
    );
  };

  return (
    <AuthTicket
      title="Activa tu cuenta"
      lead="Escribe la contraseña con la que creaste tu cuenta para confirmar que eres tú."
      stubLabel="Falta poco"
      tone="lilac"
      photo={photo}
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate aria-busy={pending} className="flex max-w-[26rem] flex-col gap-4">
        <PasswordField label="Contraseña" autoComplete="current-password" value={password} error={missing} onChange={setPassword} />
        {error ? (
          <Notice variant="danger" title="No pudimos activarla">
            {error}
          </Notice>
        ) : null}
        <Button type="submit" variant="primary" loading={pending}>
          Activar mi cuenta
        </Button>
        <Link href={STORE_ROUTES.forgotPassword} className="self-start text-sm font-bold underline underline-offset-4">
          No la recuerdo
        </Link>
      </form>
    </AuthTicket>
  );
};

export { VerifyFlow };
