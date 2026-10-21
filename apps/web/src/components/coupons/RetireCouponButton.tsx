"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PanelCoupon } from "@/lib/coupons/panelCoupon";

interface RetireCouponButtonProps {
  coupon: PanelCoupon;
  disabled: boolean;
  /** Never throw: resolve `false` on failure; the modal keeps the message. */
  onRetire: () => Promise<boolean>;
  onReactivate: () => Promise<boolean>;
}

/**
 * Retiring only stops NEW uses: orders that already redeemed the coupon keep
 * their frozen discount. It asks first; reactivating is harmless, so it does not.
 */
const RetireCouponButton = ({ coupon, disabled, onRetire, onReactivate }: RetireCouponButtonProps) => {
  const [confirming, setConfirming] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  if (!coupon.isActive) {
    return (
      <Button
        className="mr-auto"
        disabled={disabled}
        loading={reactivating}
        onClick={() => {
          setReactivating(true);
          void onReactivate().finally(() => setReactivating(false));
        }}
      >
        Reactivar
      </Button>
    );
  }

  return (
    <>
      <Button variant="danger" className="mr-auto" disabled={disabled} onClick={() => setConfirming(true)}>
        Retirar
      </Button>
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={`Retirar «${coupon.code}»`}
        description="Los clientes ya no podrán usarlo. Los pedidos que ya lo usaron no cambian. Podrás reactivarlo después."
        confirmLabel="Retirar cupón"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          await onRetire();
        }}
      />
    </>
  );
};

export type { RetireCouponButtonProps };
export { RetireCouponButton };
