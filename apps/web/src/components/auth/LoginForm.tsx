"use client";

import type { LoginRequest } from "@gira/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useReducer, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { isApiError } from "@/lib/api/ApiError";
import { login } from "@/lib/api/auth";
import { initialLoginState, loginReducer } from "@/lib/auth/loginMachine";

/**
 * Single-step login form: the API takes `{email, password, code?}` in one
 * request. When 2FA is enabled and `code` is missing, it answers 401 with a
 * fixed message; on that response this form reveals the code field in place
 * instead of moving to a second screen, so the admin never loses what they
 * already typed (Manuel's explicit call — the API is one step, not two).
 */
const LoginForm = () => {
  const router = useRouter();
  const [state, dispatch] = useReducer(loginReducer, initialLoginState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.pending) return;
    dispatch({ type: "submit" });

    // exactOptionalPropertyTypes: `code` must be omitted outside the 2FA
    // phase, never sent as an empty string or `undefined`.
    const input: LoginRequest =
      state.phase === "twoFactor" ? { email, password, code } : { email, password };

    try {
      await login(input);
      dispatch({ type: "success" });
      router.replace("/resumen");
      router.refresh();
    } catch (error) {
      const message = isApiError(error) ? error.message : "Ocurrió un error inesperado.";
      const status = isApiError(error) ? error.status : 0;
      dispatch({ type: "failure", message, status });
    }
  };

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
