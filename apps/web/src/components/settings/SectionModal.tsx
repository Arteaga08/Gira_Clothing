"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";

interface SectionModalProps {
  title: string;
  /** The `<form>` inside `children` that the save button submits. */
  formId: string;
  dirty: boolean;
  saving: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The frame of a settings section's editor. Escape, the X and the veil all go
 * through `requestClose`: nothing closes while a save is running, and typing
 * that was not saved is never dropped without asking. «Guardar» stays off until
 * something changed: the only yellow button of the screen.
 */
const SectionModal = ({ title, formId, dirty, saving, onClose, children }: SectionModalProps) => {
  const [discarding, setDiscarding] = useState(false);

  const requestClose = () => {
    if (saving) return;
    if (dirty) setDiscarding(true);
    else onClose();
  };

  const footer = (
    <>
      <Button variant="danger" onClick={requestClose} disabled={saving}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} variant="primary" loading={saving} disabled={!dirty}>
        Guardar
      </Button>
    </>
  );

  return (
    <Modal open onClose={requestClose} title={title} footer={footer}>
      {children}
      <ConfirmDialog
        open={discarding}
        tone="danger"
        title="¿Descartar los cambios?"
        description="Lo que escribiste no se ha guardado."
        confirmLabel="Descartar"
        onCancel={() => setDiscarding(false)}
        onConfirm={() => {
          setDiscarding(false);
          onClose();
        }}
      />
    </Modal>
  );
};

export type { SectionModalProps };
export { SectionModal };
