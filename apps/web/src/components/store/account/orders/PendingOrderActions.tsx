"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CustomerOrder, Wire } from "@gira/shared";
import { CancelOrderButton } from "@/components/store/checkout/CancelOrderButton";
import { PaymentSection } from "@/components/store/checkout/PaymentSection";
import { Button } from "@/components/ui/Button";
import { T_PASS_SECTION } from "@/components/ui/typography";
import { payMyOrder } from "@/lib/api/orders";
import { formatPesos } from "@/lib/catalog/money";
import { resumePayment } from "@/lib/checkout/preparePayment";
import { orderRoute, publicOrderRoute } from "@/lib/store/routes";

/**
 * «Este pedido está por pagar»: pay it with the same Payment Element as the checkout (the order and its
 * total already exist, so only the intent's secret is fetched) or cancel it. The payment panel replaces
 * the buttons in place, so it takes focus on open and focus returns to the section heading on close.
 */
const PendingOrderActions = ({ order }: { order: Wire<CustomerOrder> }) => {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const payHeadingRef = useRef<HTMLHeadingElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      return;
    }
    (paying ? payHeadingRef : headingRef).current?.focus();
  }, [paying]);

  return (
    <section aria-labelledby="pending-order-title" className="grid gap-3 border-t-2 border-dashed border-ink pt-6">
      <h2 id="pending-order-title" ref={headingRef} tabIndex={-1} className={`${T_PASS_SECTION} outline-none`}>
        Este pedido está por pagar
      </h2>
      {paying ? (
        <div className="grid gap-3">
          <h3 ref={payHeadingRef} tabIndex={-1} className="text-sm font-bold outline-none">
            Paga con tarjeta
          </h3>
          <PaymentSection
            amount={order.total}
            payLabel={`Pagar ${formatPesos(order.total)}`}
            canPay
            prepare={() => resumePayment(() => payMyOrder(order.id))}
            returnUrl={(publicId) => `${window.location.origin}${publicOrderRoute(publicId)}`}
            onPaid={(publicId) => router.push(publicOrderRoute(publicId))}
          />
          <div>
            <Button type="button" variant="danger" size="sm" onClick={() => setPaying(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-text-secondary">Reservamos tus artículos por 30 minutos desde que hiciste el pedido. Págalo o cancélalo para hacer otro.</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="primary" onClick={() => setPaying(true)}>
              Pagar pedido
            </Button>
            <CancelOrderButton orderId={order.id} orderNumber={order.orderNumber} returnPath={orderRoute(order.id)} />
          </div>
        </>
      )}
    </section>
  );
};

export { PendingOrderActions };
