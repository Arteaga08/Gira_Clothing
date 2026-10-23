"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { isApiError } from "@/lib/api/ApiError";
import { resetTwoFactor } from "@/lib/api/auth";

interface ResetTwoFactorModalProps {
  onClose: () => void;
}

const CODE_PATTERN = /^\d{6}$/;
const GENERIC_ERROR = "No se pudo reiniciar la verificación en dos pasos.";

/**
 * Turns the second factor off with the current code (the API refuses without
 * it: a stolen session must not strip the factor). Every session dies, this one
 * included, so success always ends at /login, where the next sign-in enrols a
 * new authenticator app. A wrong or locked code is the code's fault and sits on
 * the field; anything else is a notice.
 */
const ResetTwoFactorModal = ({ onClose }: ResetTwoFactorModalProps) => {
  const router = useRouter();
  const formId = `reset-2fa-${useId()}`;
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const requestClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const trimmed = code.trim();
    if (!CODE_PATTERN.test(trimmed)) {
      setCodeError("Escribe los 6 dígitos de tu app.");
      return;
    }
    setCodeError(null);
    setPending(true);
    try {
      await resetTwoFactor(trimmed);
      router.replace("/login");
      router.refresh();
    } catch (failure) {
      setPending(false);
      if (isApiError(failure) && (failure.status === 400 || failure.status === 429)) {
        setCodeError(failure.message);
      } else {
        setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
      }
    }
  };

  const footer = (
    <>
      <Button variant="danger" onClick={requestClose} disabled={pending}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} variant="danger" loading={pending}>
        Reiniciar 2FA
      </Button>
    </>
  );

  return (
    <Modal open onClose={requestClose} title="Reiniciar verificación en dos pasos" footer={footer}>
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
        <Notice variant="warning" title="Esto cierra todas las sesiones">
          <p>
            Reiniciar cierra todas las sesiones de tu cuenta, incluida esta. Al volver a entrar tendrás que
            configurar tu app de nuevo con un código QR.
          </p>
        </Notice>
        {error ? (
          <Notice variant="danger" title="No se pudo reiniciar">
            <p>{error}</p>
          </Notice>
        ) : null}
        <Field
          label="Código de tu app de autenticación"
          helper="Los 6 dígitos que muestra ahora tu app."
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          value={code}
          error={codeError ?? undefined}
          onChange={(event) => {
            setCodeError(null);
            setCode(event.target.value);
          }}
        />
      </form>
    </Modal>
  );
};

export type { ResetTwoFactorModalProps };
export { ResetTwoFactorModal };
