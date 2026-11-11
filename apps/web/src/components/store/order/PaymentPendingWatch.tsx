"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClassName } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePaymentPolling } from "@/hooks/usePaymentPolling";
import { forgetCheckoutKey } from "@/lib/checkout/idempotencyKey";
import { STORE_ROUTES } from "@/lib/store/routes";

/**
 * A pending order while the bank confirms. It watches (every 3 s, ten times) and re-renders the page when
 * the status moves; it never claims «paid» itself. Out of attempts it says so and points to «Mis pedidos».
 */
const PaymentPendingWatch = ({ publicId }: { publicId: string }) => {
  const phase = usePaymentPolling({ publicId });

  // The checkout is over (the order exists): the next purchase must not reuse this one's idempotency key.
  useEffect(() => forgetCheckoutKey(), []);

  if (phase === "timed-out") {
    return (
      <Notice variant="info" title="Tu banco aún no confirma el pago">
        <p>Revisa «Mis pedidos» en unos minutos. Si se cobró, lo verás ahí.</p>
        <Link href={STORE_ROUTES.orders} className={`${buttonClassName("edit", "sm")} mt-2`}>
          Ver mis pedidos
        </Link>
      </Notice>
    );
  }

  return (
    <div role="status" className="grid gap-4">
      <p>Esto toma unos segundos. No cierres esta página.</p>
      <div aria-hidden="true" className="grid gap-2">
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
};

export { PaymentPendingWatch };
