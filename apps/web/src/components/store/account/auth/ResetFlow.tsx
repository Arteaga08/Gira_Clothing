"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useSubmit } from "@/hooks/useSubmit";
import { isApiError } from "@/lib/api/ApiError";
import { resetPassword } from "@/lib/api/auth";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { focusFirstInvalid } from "@/lib/auth/focus";
import { passwordError } from "@/lib/auth/password";
import { confirmPasswordError } from "@/lib/auth/validation";
import type { AuthPhoto } from "@/lib/store/authPhoto";
import { STORE_ROUTES } from "@/lib/store/routes";
import { AuthTicket } from "./AuthTicket";
import { InvalidLinkPanel } from "./InvalidLinkPanel";
import { PasswordField } from "./PasswordField";

interface ResetFlowProps {
  /** The 64-hex token from the link, or null when it was missing or malformed. */
  token: string | null;
  photo: AuthPhoto | null;
}

interface Errors {
  password?: string | undefined;
  confirmation?: string | undefined;
}

// The API answers a dead link as a 400 whose message talks about «el enlace»; anything else
// at 400 is a problem with the password itself and stays on the form.
const isDeadLink = (failure: unknown): boolean =>
  isApiError(failure) && failure.kind === "http" && failure.status === 400 && /enlace/i.test(failure.message);

/** `/restablecer-contrasena`. Sets the new password (the API closes every session) and sends the visitor to «Ingresar»; it does not log in. */
const ResetFlow = ({ token, photo }: ResetFlowProps) => {
  const { pending, error, setError, run } = useSubmit();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [view, setView] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");

  if (view === "invalid" || !token) return <InvalidLinkPanel photo={photo} kind="reset" />;

  if (view === "done") {
    return (
      <AuthTicket
        title="Contraseña actualizada"
        lead="Por seguridad cerramos tu sesión en todos tus dispositivos. Entra de nuevo con la contraseña nueva."
        stubLabel="¡Listo!"
        tone="mint"
        photo={photo}
      >
        <Link href={STORE_ROUTES.login} className={buttonClassName("primary", "md", "w-full max-w-[26rem]")}>
          Ingresar
        </Link>
      </AuthTicket>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const found: Errors = {
      password: passwordError(password) ?? undefined,
      confirmation: confirmPasswordError(password, confirmation) ?? undefined,
    };
    setErrors(found);
    if (found.password || found.confirmation) {
      focusFirstInvalid(form);
      return;
    }

    await run(
      async () => {
        await resetPassword({ token, password });
        setView("done");
      },
      {
        onError: (failure) => {
          if (isDeadLink(failure)) {
            setView("invalid");
            return;
          }
          setError(authFailureMessage(failure));
        },
      },
    );
  };

  return (
    <AuthTicket title="Crea tu contraseña nueva" lead="Elige una que no uses en ningún otro sitio." stubLabel="Clave nueva" tone="pink" photo={photo}>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate aria-busy={pending} className="flex max-w-[26rem] flex-col gap-4">
        <PasswordField
          label="Contraseña nueva"
          autoComplete="new-password"
          showStrength
          value={password}
          error={errors.password}
          onChange={(value) => {
            setPassword(value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
        />
        <PasswordField
          label="Repite la contraseña"
          autoComplete="new-password"
          value={confirmation}
          error={errors.confirmation}
          onChange={(value) => {
            setConfirmation(value);
            setErrors((current) => ({ ...current, confirmation: undefined }));
          }}
        />
        {error ? (
          <Notice variant="danger" title="No pudimos guardarla">
            {error}
          </Notice>
        ) : null}
        <Button type="submit" variant="primary" loading={pending}>
          Guardar contraseña
        </Button>
        <Link href={STORE_ROUTES.login} className="self-start text-sm font-bold underline underline-offset-4">
          Cancelar
        </Link>
      </form>
    </AuthTicket>
  );
};

export { ResetFlow };
