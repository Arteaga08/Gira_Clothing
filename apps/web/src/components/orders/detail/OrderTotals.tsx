
import { formatMoney } from "@/lib/orders/money";
import { carrierServiceLabel } from "@/lib/orders/shipping";
import type { PanelOrder } from "@/lib/orders/panelOrder";

interface OrderTotalsProps {
  order: PanelOrder;
}

const Row = ({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-4 ${muted ? "text-text-muted" : ""}`}>
    <dt className="text-sm">{label}</dt>
    <dd className="font-mono text-sm font-bold">{value}</dd>
  </div>
);

/**
 * Prices include IVA, so the tax line is shown as "of which", never added on
 * top. Everything is cents formatted in mono (the Numbers-Are-Mono rule).
 */
const OrderTotals = ({ order }: OrderTotalsProps) => {
  const money = (cents: number) => formatMoney(cents, order.currency);
  const selection = order.shippingSelection;
  const shippingLabel = selection
    ? `Envío · ${carrierServiceLabel(selection.carrier, selection.serviceName)}`
    : "Envío";
  const ratePercent = order.taxRateBps / 100;

  return (
    <dl className="ml-auto flex max-w-sm flex-col gap-1.5">
      <Row label="Subtotal (IVA incluido)" value={money(order.subtotal)} />
      <Row label={`de los cuales IVA ${ratePercent} %`} value={money(order.tax)} muted />
      {order.discount > 0 ? <Row label="Descuento" value={`−${money(order.discount)}`} /> : null}
      <Row label={shippingLabel} value={money(order.shippingCost)} />
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-2">
        <dt className="text-base font-bold">Total</dt>
        <dd className="font-mono text-lg font-bold">{money(order.total)}</dd>
      </div>
    </dl>
  );
};

export type { OrderTotalsProps };
export { OrderTotals };
