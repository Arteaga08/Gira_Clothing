"use client";

import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { IconButton } from "./IconButton";
import { T_PANEL_TITLE } from "./typography";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Side panel (30rem, full width on mobile). Portalled for the same reason as
 * CommandPalette: sticky/transformed ancestors would trap it under the scrim.
 * Escape and a click on the scrim close it; focus is trapped inside and
 * returned to the trigger on close (useFocusTrap).
 */
const SlideOver = ({ open, onClose, title, children, footer }: SlideOverProps) => {
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  const titleId = useId();

  if (typeof document === "undefined" || !open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-(--z-overlay)">
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 bg-scrim" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="fixed inset-y-0 right-0 z-(--z-dialog) flex h-dvh w-full max-w-[30rem] animate-slide-in flex-col border-l-2 border-ink bg-surface text-text-primary shadow-nb-lg motion-reduce:animate-none"
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-6 py-4">
          <h2 id={titleId} className={T_PANEL_TITLE}>
            {title}
          </h2>
          <IconButton icon={XIcon} label="Cerrar panel" size="sm" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t-2 border-ink px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
};

export type { SlideOverProps };
export { SlideOver };
