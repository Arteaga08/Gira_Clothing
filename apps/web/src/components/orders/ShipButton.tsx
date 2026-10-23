"use client";

import { TruckIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";

interface ShipButtonProps {
  orderNumber: string;
  variant: "primary" | "positive";
  loading: boolean;
  disabled?: boolean;
  className?: string;
  onShip: () => void;
}

/** "Marcar enviado" emails the customer, so it asks first. Used by the list preview and the detail. */
const ShipButton = ({ orderNumber, variant, loading, disabled, className, onShip }: ShipButtonProps) => {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        loading={loading}
        {...(disabled !== undefined ? { disabled } : {})}
        {...(className ? { className } : {})}
        onClick={() => setConfirming(true)}
      >
        <Icon icon={TruckIcon} />
        Marcar enviado
      </Button>
      <ConfirmDialog
        open={confirming}
        title="¿Marcar el pedido como enviado?"
        description={
          <>
            Se avisará al cliente por correo con el número de guía del pedido{" "}
            <strong className="font-mono">{orderNumber}</strong>.
          </>
        }
        confirmLabel="Sí, marcar enviado"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onShip();
        }}
      />
    </>
  );
};

export type { ShipButtonProps };
export { ShipButton };
