"use client";

import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useSubmit } from "@/hooks/useSubmit";
import { register } from "@/lib/api/auth";
import { focusFirstInvalid } from "@/lib/auth/focus";
import { passwordError } from "@/lib/auth/password";
import { confirmPasswordError, emailError, nameError } from "@/lib/auth/validation";
import type { AuthPhoto } from "@/lib/store/authPhoto";
import { STORE_ROUTES, withRedirect } from "@/lib/store/routes";
import { AuthSwitch } from "./AuthSwitch";
import { AuthTicket } from "./AuthTicket";
import { CheckEmail } from "./CheckEmail";
import { PasswordField } from "./PasswordField";

interface RegisterFlowProps {
  redirectTo: string;
  photo: AuthPhoto | null;
}

type FieldKey = "firstName" | "lastName" | "email" | "password" | "confirmation" | "terms";
type FieldErrors = Partial<Record<FieldKey, string>>;

const TERMS_ERROR = "Acepta los Términos y el Aviso de privacidad para crear tu cuenta.";

/**
 * Signup, then «Revisa tu correo». The API answers the same 201 whether or not the address
 * already has an account and never opens a session, so this screen never claims the account
 * "was created", only that a link was sent.
 */
const RegisterFlow = ({ redirectTo, photo }: RegisterFlowProps) => {
  const { pending, error, run } = useSubmit();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const termsErrorId = useId();

  // Editing a field clears only that field's message.
  const clear = (key: FieldKey) => setErrors((current) => ({ ...current, [key]: undefined }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const found: FieldErrors = {};
    const problems: [FieldKey, string | null][] = [
      ["firstName", nameError(firstName, "nombre")],
      ["lastName", nameError(lastName, "apellido")],
      ["email", emailError(email)],
      ["password", passwordError(password)],
      ["confirmation", confirmPasswordError(password, confirmation)],
      ["terms", terms ? null : TERMS_ERROR],
    ];
    for (const [key, message] of problems) if (message) found[key] = message;
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstInvalid(form);
      return;
    }

    await run(async () => {
      await register({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password });
      setSentTo(email.trim());
    });
  };

  if (sentTo) return <CheckEmail email={sentTo} photo={photo} onUseOther={() => setSentTo(null)} />;

  return (
    <AuthTicket
      title="Crear cuenta"
      lead="Saca tu pase: compras más rápido y sigues cada pedido."
      stubLabel="Pase de miembro"
      tone="lilac"
      photo={photo}
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate aria-busy={pending} className="flex max-w-[26rem] flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Nombre"
            autoComplete="given-name"
            placeholder="María"
            value={firstName}
            error={errors.firstName}
            onChange={(event) => {
              setFirstName(event.target.value);
              clear("firstName");
            }}
          />
          <Field
            label="Apellido"
            autoComplete="family-name"
            placeholder="López"
            value={lastName}
            error={errors.lastName}
            onChange={(event) => {
              setLastName(event.target.value);
              clear("lastName");
            }}
          />
        </div>
        <Field
          label="Correo"
          type="email"
          autoComplete="email"
          placeholder="maria.lopez@correo.mx"
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.target.value);
            clear("email");
          }}
        />
        <PasswordField
          label="Contraseña"
          autoComplete="new-password"
          placeholder="Crea una contraseña"
          showStrength
          value={password}
          error={errors.password}
          onChange={(value) => {
            setPassword(value);
            clear("password");
          }}
        />
        <PasswordField
          label="Repite la contraseña"
          autoComplete="new-password"
          placeholder="Escríbela otra vez"
          value={confirmation}
          error={errors.confirmation}
          onChange={(value) => {
            setConfirmation(value);
            clear("confirmation");
          }}
        />
        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={terms}
              onChange={(event) => {
                setTerms(event.target.checked);
                clear("terms");
              }}
              aria-invalid={errors.terms ? true : undefined}
              aria-describedby={errors.terms ? termsErrorId : undefined}
              className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-brand"
            />
            <span>
              Acepto los{" "}
              <Link href="/terminos" target="_blank" className="font-bold underline underline-offset-4">
                Términos
              </Link>{" "}
              y el{" "}
              <Link href="/privacidad" target="_blank" className="font-bold underline underline-offset-4">
                Aviso de privacidad
              </Link>
              .
            </span>
          </label>
          {errors.terms ? (
            <p id={termsErrorId} className="mt-1.5 text-xs text-danger">
              {errors.terms}
            </p>
          ) : null}
        </div>
        {error ? (
          <Notice variant="danger" title="No pudimos crear tu cuenta">
            {error}
          </Notice>
        ) : null}
        <Button type="submit" variant="primary" loading={pending}>
          Crear mi cuenta
        </Button>
        <p className="text-sm text-text-secondary">
          Te enviaremos un correo para activarla. Al abrirlo escribirás esta misma contraseña para confirmar que eres tú.
        </p>
      </form>
      <AuthSwitch text="¿Ya tienes cuenta?" label="Ingresar" href={withRedirect(STORE_ROUTES.login, redirectTo)} />
    </AuthTicket>
  );
};

export { RegisterFlow };
