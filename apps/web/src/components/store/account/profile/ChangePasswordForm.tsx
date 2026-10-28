"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useSubmit } from "@/hooks/useSubmit";
import { changePassword } from "@/lib/api/account";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { passwordError } from "@/lib/auth/password";
import { confirmPasswordError } from "@/lib/auth/validation";
import { goToLogin, isSessionExpired } from "@/lib/account/sessionExpired";
import { STORE_ROUTES } from "@/lib/store/routes";
import { PasswordField } from "../auth/PasswordField";

interface ChangePasswordFormProps {
  onDone: () => void;
  onCancel: () => void;
}

interface Errors {
  current?: string | undefined;
  next?: string | undefined;
  confirm?: string | undefined;
}

/** Change of password while signed in. The API closes the other devices and keeps this one. */
const ChangePasswordForm = ({ onDone, onCancel }: ChangePasswordFormProps) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const { pending, error, setError, run } = useSubmit();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: Errors = {
      current: current === "" ? "Escribe tu contraseña actual." : undefined,
      next: passwordError(next) ?? undefined,
      confirm: confirmPasswordError(next, confirm) ?? undefined,
    };
    setErrors(found);
    if (found.current || found.next || found.confirm) return;
    void run(
      async () => {
        await changePassword({ currentPassword: current, newPassword: next });
        onDone();
      },
      {
        onError: (failure) => {
          if (isSessionExpired(failure)) goToLogin(STORE_ROUTES.profile);
          else setError(authFailureMessage(failure));
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {error ? (
        <Notice variant="danger" title="No pudimos cambiar tu contraseña">
          {error}
        </Notice>
      ) : null}
      <PasswordField label="Contraseña actual" autoComplete="current-password" value={current} error={errors.current} onChange={setCurrent} placeholder="Tu contraseña de hoy" />
      <PasswordField label="Contraseña nueva" autoComplete="new-password" value={next} error={errors.next} onChange={setNext} placeholder="Crea una contraseña" showStrength />
      <PasswordField label="Repite la contraseña nueva" autoComplete="new-password" value={confirm} error={errors.confirm} onChange={setConfirm} placeholder="Escríbela otra vez" />
      <p className="text-xs text-text-secondary">Al cambiarla cerraremos tu sesión en tus otros dispositivos.</p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={pending}>
          Cambiar contraseña
        </Button>
        <Button type="button" variant="danger" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
};

export { ChangePasswordForm };
