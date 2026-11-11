"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { goToLogin, isSessionExpired } from "@/lib/account/sessionExpired";
import { cancelMyOrder } from "@/lib/api/orders";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { announceCartChange } from "@/lib/cart/guestCart";
import { forgetCheckoutKey } from "@/lib/checkout/idempotencyKey";

interface CancelOrderButtonProps {
  orderId: string;
  orderNumber: string;
  /** The screen to come back to if the session ended while confirming. */
  returnPath: string;
  disabled?: boolean;
}

/** «Cancelar pedido»: asks first, then releases the reservation and refreshes the screen and the cart counter. */
const CancelOrderButton = ({ orderId, orderNumber, returnPath, disabled = false }: CancelOrderButtonProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const confirm = async (): Promise<void> => {
    try {
      await cancelMyOrder(orderId);
    } catch (error) {
      if (isSessionExpired(error)) {
        goToLogin(returnPath);
        return;
      }
      // The dialog shows what we throw. A 409 means the order already moved on: show the screen as it is now.
      router.refresh();
      throw new Error(authFailureMessage(error));
    }
    // The API replays a key's order whatever its status: a cancelled order must not be handed back for the same cart.
    forgetCheckoutKey();
    announceCartChange();
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button type="button" variant="danger" disabled={disabled} onClick={() => setOpen(true)}>
        Cancelar pedido
      </Button>
      <ConfirmDialog
        open={open}
        tone="danger"
        title="¿Cancelar este pedido?"
        description={`Se libera lo que reservamos para el pedido ${orderNumber}. Podrás hacer otro cuando quieras.`}
        confirmLabel="Sí, cancelar pedido"
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
};

export { CancelOrderButton };
