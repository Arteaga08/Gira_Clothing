"use client";

import { CANCEL_REASON_MAX, CANCEL_REASON_MIN } from "@gira/shared";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface CancelOrderActionProps {
  busy: boolean;
  /** Resolves to something truthy when the API accepted the cancellation; the dialog stays open otherwise. */
  onCancelOrder: (reason: string) => Promise<unknown>;
}

/** Only offered while the order is unpaid. The written reason is mandatory and ends up on the order. */
const CancelOrderAction = ({ busy, onCancelOrder }: CancelOrderActionProps) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" disabled={busy} onClick={() => setOpen(true)}>
        Cancelar pedido
      </Button>
      <ConfirmDialog
        open={open}
        tone="danger"
        title="¿Cancelar el pedido?"
        description="Se liberará el stock reservado. Esta acción no se puede deshacer."
        confirmLabel="Cancelar pedido"
        reasonField={{ label: "Motivo de la cancelación", minLength: CANCEL_REASON_MIN, maxLength: CANCEL_REASON_MAX }}
        onCancel={() => setOpen(false)}
        onConfirm={async (reason) => {
          if (await onCancelOrder(reason ?? "")) setOpen(false);
        }}
      />
    </>
  );
};

export type { CancelOrderActionProps };
export { CancelOrderAction };
