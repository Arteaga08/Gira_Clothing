"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { IconButton } from "./IconButton";
import { T_PANEL_TITLE } from "./typography";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned under the scrolling body: the actions of the form. */
  footer?: ReactNode;
}

/**
 * Centered dialog (35rem; a bottom sheet on phones). Portalled for the same
 * reason as SlideOver: sticky/transformed ancestors would trap it under the
 * scrim. Escape and a click on the scrim close it; focus is trapped inside and
 * returned to the trigger on close (useFocusTrap). A dialog opened from inside
 * it (ConfirmDialog) is a React child, so its Escape bubbles here: it already
 * called preventDefault, which is how this one knows to stay open.
 */
const Modal = ({ open, onClose, title, children, footer }: ModalProps) => {
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  const titleId = useId();

  if (typeof document === "undefined" || !open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-(--z-overlay) flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 bg-scrim" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="relative z-(--z-dialog) flex max-h-[92dvh] w-full flex-col rounded-t-nb border-2 border-ink bg-surface text-text-primary shadow-nb-lg sm:max-h-[calc(100dvh-3rem)] sm:max-w-[35rem] sm:rounded-nb"
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-6 py-4">
          <h2 id={titleId} className={T_PANEL_TITLE}>
            {title}
          </h2>
          <IconButton icon={XIcon} label="Cerrar" size="sm" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-nb border-t-2 border-ink bg-surface-raised px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};

export type { ModalProps };
export { Modal };
