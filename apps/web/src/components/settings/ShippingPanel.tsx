import { MEXICAN_STATES, type ShippingSettings, type Wire } from "@gira/shared";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { T_LABEL } from "@/components/ui/typography";
import { formatMxn } from "@/lib/coupons/money";
import { formatInteger } from "@/lib/format";

interface ShippingPanelProps {
  shipping: Wire<ShippingSettings>;
  onEdit: () => void;
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1 border-t border-border py-3 first:border-t-0 first:pt-0 sm:flex-row sm:gap-4">
    <dt className={`${T_LABEL} w-36 shrink-0 pt-0.5 text-text-muted`}>{label}</dt>
    <dd className="text-sm">{children}</dd>
  </div>
);

/** What the shipping section holds today; the origin is the business's own address, not customer data. */
const ShippingPanel = ({ shipping, onEdit }: ShippingPanelProps) => {
  const { origin, parcel } = shipping;
  const stateName = origin ? (MEXICAN_STATES.find((state) => state.code === origin.state)?.name ?? origin.state) : "";

  return (
    <Panel
      title="Envío"
      hint="Origen, envío gratis y caja"
      actions={
        <Button size="sm" onClick={onEdit}>
          Editar
        </Button>
      }
    >
      {origin ? null : (
        <Notice variant="warning" title="Falta el origen de los paquetes" className="mb-4">
          <p>Sin origen no se pueden cotizar envíos ni comprar guías. Captúralo en «Editar».</p>
        </Notice>
      )}
      <dl>
        {origin ? (
          <Row label="Origen">
            <span className="block font-bold">{origin.name}</span>
            <span className="block">{`${origin.line1}, ${origin.district}`}</span>
            <span className="block">{`${origin.city}, ${stateName}, CP ${origin.postalCode}`}</span>
            <span className="block font-mono text-text-secondary">{origin.phone}</span>
          </Row>
        ) : null}
        <Row label="Envío gratis">
          {shipping.freeShippingThreshold === null
            ? "No se ofrece"
            : `Desde ${formatMxn(shipping.freeShippingThreshold)} de compra`}
        </Row>
        <Row label="Caja estándar">
          <span className="font-mono">
            {`${parcel.boxLengthCm} × ${parcel.boxWidthCm} × ${parcel.boxHeightCm} cm`}
          </span>
          <span className="block text-text-secondary">
            {`Empaque ${formatInteger(parcel.tareGrams)} g · +${parcel.extraUnitHeightCm} cm por prenda · máx. ${formatInteger(parcel.maxWeightGrams)} g`}
          </span>
        </Row>
        <Row label="Cotización">{`Vigente ${shipping.quoteTtlMinutes} minutos`}</Row>
      </dl>
    </Panel>
  );
};

export type { ShippingPanelProps };
export { ShippingPanel };
