"use client";

import type { ShippingAddress } from "@gira/shared";
import { MEXICAN_STATES, ShippingLabelStatus } from "@gira/shared";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { canEditShippingAddress } from "@/lib/orders/status";
import { AddressForm } from "./AddressForm";
import type { PanelOrder } from "@/lib/orders/panelOrder";

interface AddressCardProps {
  order: PanelOrder;
  onSave: (address: ShippingAddress) => Promise<boolean>;
}

const AddressCard = ({ order, onSave }: AddressCardProps) => {
  const [editing, setEditing] = useState(false);
  const { shipping } = order;
  const stateName = MEXICAN_STATES.find((state) => state.code === shipping.state)?.name ?? shipping.state;
  const editable = canEditShippingAddress(order.status);
  const labelWillBeReplaced = order.label?.status === ShippingLabelStatus.READY;

  return (
    <section aria-labelledby="address-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="address-title" className={T_PANEL_TITLE}>
          Enviar a
        </h3>
        {editable ? (
          <Button size="sm" onClick={() => setEditing(true)}>
            Corregir dirección
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-relaxed">
        <strong>{shipping.recipient}</strong>
        <br />
        {shipping.line1}
        {shipping.line2 ? `, ${shipping.line2}` : ""}
        <br />
        Col. {shipping.district}, {shipping.city}, {stateName}, {shipping.postalCode}
      </p>
      {editable ? null : (
        <p className="mt-2 text-xs text-text-muted">La dirección ya no se puede corregir: el pedido está enviado o cerrado.</p>
      )}
      <SlideOver open={editing} onClose={() => setEditing(false)} title="Corregir dirección">
        <AddressForm
          address={shipping}
          labelWillBeReplaced={labelWillBeReplaced}
          onSubmit={onSave}
          onCancel={() => setEditing(false)}
        />
      </SlideOver>
    </section>
  );
};

export type { AddressCardProps };
export { AddressCard };
