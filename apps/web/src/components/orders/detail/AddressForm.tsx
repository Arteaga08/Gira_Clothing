"use client";

import { MEXICAN_STATES, type ShippingAddress } from "@gira/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import { validateAddress, type AddressErrors } from "@/lib/orders/address";

interface AddressFormProps {
  address: ShippingAddress;
  /** A ready label is cancelled and bought again when the address changes. */
  labelWillBeReplaced: boolean;
  /** Resolves true when the API accepted the change; the form closes only then. */
  onSubmit: (address: ShippingAddress) => Promise<boolean>;
  onCancel: () => void;
}

const STATE_OPTIONS = [
  { value: "", label: "Elige un estado" },
  ...MEXICAN_STATES.map((state) => ({ value: state.code, label: state.name })),
];

const POSTAL_CODE_HELP = "No se puede cambiar: cambia el costo del envío. Si es otro código postal, cancela y crea el pedido de nuevo.";

/**
 * Address correction. The postal code is ALWAYS read-only: the API rejects any
 * change to it (it would change the shipping price), so the form never offers it.
 */
const AddressForm = ({ address, labelWillBeReplaced, onSubmit, onCancel }: AddressFormProps) => {
  const [values, setValues] = useState<ShippingAddress>({ ...address, line2: address.line2 ?? "" });
  const [errors, setErrors] = useState<AddressErrors>({});
  const [saving, setSaving] = useState(false);

  const bind = (key: keyof ShippingAddress) => ({
    value: values[key] ?? "",
    onChange: (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value })),
    ...(errors[key] ? { error: errors[key] } : {}),
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateAddress(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const cleaned: ShippingAddress = {
      recipient: values.recipient.trim(),
      line1: values.line1.trim(),
      district: values.district.trim(),
      city: values.city.trim(),
      state: values.state,
      postalCode: values.postalCode.trim(),
      country: "MX",
      ...((values.line2 ?? "").trim() ? { line2: (values.line2 ?? "").trim() } : {}),
    };
    setSaving(true);
    const saved = await onSubmit(cleaned);
    setSaving(false);
    if (saved) onCancel();
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
      {labelWillBeReplaced ? (
        <Notice variant="warning" title="Se cambiará la guía">
          Ya hay una guía lista. Al guardar se cancela y se compra otra con la dirección nueva.
        </Notice>
      ) : null}
      <Field label="Destinatario" autoComplete="off" {...bind("recipient")} />
      <Field label="Calle y número" autoComplete="off" {...bind("line1")} />
      <Field label="Interior o referencias (opcional)" autoComplete="off" {...bind("line2")} />
      <Field label="Colonia" autoComplete="off" {...bind("district")} />
      <Field label="Ciudad" autoComplete="off" {...bind("city")} />
      <SelectField
        label="Estado"
        options={STATE_OPTIONS}
        value={values.state}
        onChange={(next) => setValues((current) => ({ ...current, state: next }))}
        error={errors.state}
      />
      <Field label="Código postal" readOnly value={values.postalCode} helper={POSTAL_CODE_HELP} className="font-mono" />
      <div className="mt-2 flex justify-end gap-2">
        <Button onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          Guardar dirección
        </Button>
      </div>
    </form>
  );
};

export type { AddressFormProps };
export { AddressForm };
