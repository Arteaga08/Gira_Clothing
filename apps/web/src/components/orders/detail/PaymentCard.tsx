"use client";

import { OrderStatus, PaymentStatus } from "@gira/shared";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { formatShortDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/orders/money";
import { PAYMENT_STATUS_LABELS, isRefundPending, paymentProviderLabel } from "@/lib/orders/payment";
import type { PanelOrder } from "@/lib/orders/panelOrder";

interface PaymentCardProps {
  order: PanelOrder;
  onRefund: () => Promise<unknown>;
}

const REFUNDABLE: readonly OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-sm text-text-secondary">{label}</dt>
    <dd className="font-mono text-sm font-bold">{value}</dd>
  </div>
);

/**
 * Payment summary. Never more than brand + last4 of the card. The refund is
 * always total and only REQUESTS it from Stripe: the order becomes
 * "reembolsado" when Stripe's webhook confirms, and the dialog says so.
 */
const PaymentCard = ({ order, onRefund }: PaymentCardProps) => {
  const [confirming, setConfirming] = useState(false);
  // The order stays "pagado" until Stripe's webhook confirms, so without this the button would come back
  // right after the dialog closes and invite a second refund request.
  const [refundRequestedHere, setRefundRequestedHere] = useState(false);
  const { payment } = order;
  // The API also remembers it (a reload keeps it); the local flag only covers the moment before the refetch.
  const refundRequested = refundRequestedHere || isRefundPending(payment);
  const canRefund =
    Boolean(payment.intentId) && REFUNDABLE.includes(order.status) && payment.status !== PaymentStatus.REFUNDED;
  const showRefundButton = canRefund && !refundRequested;

  return (
    <section aria-labelledby="payment-title">
      <h3 id="payment-title" className={T_PANEL_TITLE}>
        Pago
      </h3>
      <dl className="mt-3 flex flex-col gap-1.5">
        <Row label="Proveedor" value={paymentProviderLabel(payment.provider)} />
        <Row label="Estado" value={PAYMENT_STATUS_LABELS[payment.status]} />
        {payment.card ? <Row label="Tarjeta" value={`${payment.card.brand} ••••${payment.card.last4}`} /> : null}
        {payment.capturedAt ? <Row label="Cobrado" value={formatShortDateTime(payment.capturedAt)} /> : null}
        {payment.refundedAmount ? (
          <Row label="Reembolsado" value={formatMoney(payment.refundedAmount, order.currency)} />
        ) : null}
      </dl>
      {showRefundButton ? (
        <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
          Solicitar reembolso total
        </Button>
      ) : null}
      {canRefund && refundRequested ? (
        <p role="status" className="mt-4 text-sm font-bold">
          Reembolso solicitado. Esperando la confirmación de Stripe.
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title="¿Reembolsar el pedido?"
        description={
          <>
            Se pedirá a Stripe el reembolso total de <strong className="font-mono">{formatMoney(order.total, order.currency)}</strong>.
            El pedido pasará a reembolsado cuando Stripe lo confirme, no antes.
          </>
        }
        confirmLabel="Reembolsar"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          if (await onRefund()) {
            setRefundRequestedHere(true);
            setConfirming(false);
          }
        }}
      />
    </section>
  );
};

export type { PaymentCardProps };
export { PaymentCard };
