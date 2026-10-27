"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useSubmit } from "@/hooks/useSubmit";
import { login } from "@/lib/api/auth";
import { authFailureMessage, isUnverifiedFailure } from "@/lib/auth/authFailures";
import { focusFirstInvalid } from "@/lib/auth/focus";
import { emailError } from "@/lib/auth/validation";
import { mergeGuestCart } from "@/lib/cart/mergeGuestCart";
import type { AuthPhoto } from "@/lib/store/authPhoto";
import { STORE_ROUTES, withRedirect } from "@/lib/store/routes";
import { AuthSwitch } from "./AuthSwitch";
import { AuthTicket } from "./AuthTicket";
import { PasswordField } from "./PasswordField";
import { StaffAccountNotice } from "./StaffAccountNotice";
import { UnverifiedNotice } from "./UnverifiedNotice";

interface CustomerLoginFormProps {
  /** Already sanitised by `resolveRedirect` on the server. */
  redirectTo: string;
  photo: AuthPhoto | null;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * Customer login. Admin accounts use the same endpoint but never get a session from it, so
 * those answers become a pointer to the panel rather than a 2FA step (the store has none).
 * Once logged in, the visitor's browser cart is poured into the account cart before leaving;
 * a cart problem never stops the login.
 */
const CustomerLoginForm = ({ redirectTo, photo }: CustomerLoginFormProps) => {
  const router = useRouter();
  const { pending, error, setError, run } = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [unverified, setUnverified] = useState(false);
  const [staff, setStaff] = useState(false);
  // Set only when leaving the page: the button stays busy through the navigation so a second submit cannot fire.
  const [navigating, setNavigating] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (navigating) return;
    const form = event.currentTarget;
    const errors: FieldErrors = {};
    const emailProblem = emailError(email);
    if (emailProblem) errors.email = emailProblem;
    if (password === "") errors.password = "Falta tu contraseña.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid(form);
      return;
    }

    setUnverified(false);
    await run(
      async () => {
        const result = await login({ email: email.trim(), password });
        if (result.status !== "authenticated") {
          setStaff(true);
          return;
        }
        await mergeGuestCart();
        setNavigating(true);
        router.replace(redirectTo);
        router.refresh();
      },
      {
        onError: (failure) => {
          if (isUnverifiedFailure(failure)) {
            setUnverified(true);
            return;
          }
          setError(authFailureMessage(failure));
        },
      },
    );
  };

  return (
    <AuthTicket
      title="Ingresar"
      lead="Tu boleto para ver pedidos y comprar sin repetir datos."
      stubLabel="Admite una"
      tone="pink"
      photo={photo}
    >
      {staff ? (
        <StaffAccountNotice onUseAnother={() => setStaff(false)} />
      ) : (
        <>
          <form onSubmit={(event) => void handleSubmit(event)} noValidate aria-busy={pending || navigating} className="flex max-w-[26rem] flex-col gap-4">
            {unverified ? <UnverifiedNotice email={email.trim()} /> : null}
            <Field
              label="Correo"
              type="email"
              autoComplete="email"
              placeholder="maria.lopez@correo.mx"
              value={email}
              error={fieldErrors.email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <PasswordField
              label="Contraseña"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              error={fieldErrors.password}
              onChange={setPassword}
            />
            {error ? (
              <Notice variant="danger" title="No pudimos entrar">
                {error}
              </Notice>
            ) : null}
            <Button type="submit" variant="primary" loading={pending || navigating}>
              Entrar
            </Button>
            <Link href={STORE_ROUTES.forgotPassword} className="self-start text-sm font-bold underline underline-offset-4">
              Olvidé mi contraseña
            </Link>
          </form>
          <AuthSwitch text="¿Primera vez en Gira?" label="Crear cuenta" href={withRedirect(STORE_ROUTES.register, redirectTo)} />
        </>
      )}
    </AuthTicket>
  );
};

export { CustomerLoginForm };
