"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { NB_SURFACE } from "./styles";
import { T_LABEL, T_PANEL_TITLE } from "./typography";

interface ReasonField {
  label: string;
  minLength: number;
  maxLength: number;
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger";
  /** When present the dialog asks for a written reason before it can be confirmed. */
  reasonField?: ReasonField;
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
  children?: ReactNode;
}

const GENERIC_ERROR = "No se pudo completar la acción. Inténtalo de nuevo.";

/**
 * Confirmation for actions that move money, cancel, or may spend a second
 * label. Same portal + focus-trap pattern as CommandPalette. While the action
 * is running the dialog cannot be dismissed, so a second click can never fire
 * the same request twice.
 */
const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  tone = "default",
  reasonField,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) => {
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  const titleId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset while closed (state adjusted during render, as CommandPalette does): the dialog stays mounted
  // when `open` goes false, so a reason typed before a failed attempt survives, and a stale one never
  // shows up the next time it opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setReason("");
      setError(null);
    }
  }

  if (typeof document === "undefined" || !open) return null;

  const trimmed = reason.trim();
  const reasonValid = !reasonField || trimmed.length >= reasonField.minLength;

  const close = () => onCancel();

  const confirm = async () => {
    if (busy || !reasonValid) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reasonField ? trimmed : undefined);
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (!busy) close();
  };

  return createPortal(
    <div className="fixed inset-0 z-(--z-overlay)">
      <div aria-hidden="true" onClick={busy ? undefined : close} className="fixed inset-0 bg-scrim" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className={`${NB_SURFACE} relative z-(--z-dialog) mx-auto mt-24 flex w-[calc(100%-2rem)] max-w-md flex-col gap-4 p-6`}
      >
        <h2 id={titleId} className={T_PANEL_TITLE}>
          {title}
        </h2>
        {description ? <div className="text-sm leading-relaxed text-text-secondary">{description}</div> : null}
        {children}
        {reasonField ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className={`${T_LABEL} text-text-secondary`}>
              {reasonField.label}
            </label>
            <textarea
              id={reasonId}
              value={reason}
              maxLength={reasonField.maxLength}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
              className="rounded-nb-sm border-2 border-ink bg-surface p-3 text-sm text-text-primary shadow-nb-sm"
            />
            <p className="text-xs text-text-secondary">
              {reason.length}/{reasonField.maxLength} caracteres (mínimo {reasonField.minLength})
            </p>
          </div>
        ) : null}
        {error ? (
          <Notice variant="danger" title="No se pudo completar">
            {error}
          </Notice>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="danger" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            disabled={!reasonValid}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export type { ConfirmDialogProps, ReasonField };
export { ConfirmDialog };
