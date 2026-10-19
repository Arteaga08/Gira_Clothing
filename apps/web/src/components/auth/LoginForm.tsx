"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useReducer, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { isApiError } from "@/lib/api/ApiError";
import { login, verifyTwoFactor } from "@/lib/api/auth";
import { initialLoginState, loginReducer } from "@/lib/auth/loginMachine";
import { EnrollmentStep } from "./EnrollmentStep";

/**
 * Admin login in up to two requests. The first takes only the password and
 * answers what comes next (`status`): a session, the 2FA code, or forced
 * enrolment. The code is then sent on its own to `/auth/2fa/verify` — the
 * password is never re-sent, and the short-lived challenge cookie the API set
 * is what links the two steps. The code field appears in place so the admin
 * does not lose what they typed.
 */
const LoginForm = () => {
  const router = useRouter();
  const [state, dispatch] = useReducer(loginReducer, initialLoginState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const enter = () => {
    router.replace("/resumen");
    router.refresh();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.pending) return;
    dispatch({ type: "submit" });

    try {
      if (state.phase === "twoFactor") {
        await verifyTwoFactor(code);
        dispatch({ type: "success" });
        enter();
        return;
      }

      const result = await login({ email, password });
      if (result.status === "authenticated") {
        dispatch({ type: "success" });
        enter();
      } else {
        dispatch({
          type: "challenge",
          next: result.status === "two_factor_required" ? "twoFactor" : "enroll",
        });
      }
    } catch (error) {
      const message = isApiError(error) ? error.message : "Ocurrió un error inesperado.";
      const status = isApiError(error) ? error.status : 0;
      // A 401 past the password step sends the form back to the start.
      if (status === 401 && state.phase !== "credentials") setCode("");
      dispatch({ type: "failure", message, status });
    }
  };

  const handleEnrollmentDone = () => {
    dispatch({ type: "success" });
    enter();
  };

  const handleEnrollmentExpired = (message: string) => {
    dispatch({ type: "failure", message, status: 401 });
  };

  if (state.phase === "enroll") {
    return <EnrollmentStep onDone={handleEnrollmentDone} onExpired={handleEnrollmentExpired} />;
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
      <Field
        label="Correo"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Field
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {state.phase === "twoFactor" ? (
        <Field
          label="Código de verificación"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          required
          // The field only mounts on entering this phase, which is exactly
          // the semantics `autoFocus` needs — not a stolen focus on load.
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      ) : null}
      {/*
        A stable live region, not a role="alert" that appears and disappears:
        the latter announces a failure, but revealing the code field is a
        step forward, not one. Content changes here are what a screen reader
        announces.
      */}
      <p aria-live="polite" className="sr-only">
        {state.phase === "twoFactor"
          ? "Ingresa el código de verificación de tu app de autenticación."
          : ""}
      </p>
      {state.error ? (
        <Notice variant="danger" title="Error">
          {state.error}
        </Notice>
      ) : null}
      <Button type="submit" variant="primary" loading={state.pending}>
        Entrar
      </Button>
    </form>
  );
};

export { LoginForm };
