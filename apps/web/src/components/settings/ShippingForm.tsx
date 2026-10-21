"use client";

import { MEXICAN_STATES } from "@gira/shared";
import type { FormEvent, ReactNode } from "react";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { Toggle } from "@/components/ui/Toggle";
import { T_LABEL } from "@/components/ui/typography";
import {
  PARCEL_KEYS,
  PARCEL_LABELS,
  type ShippingFormErrors,
  type ShippingFormValues,
} from "@/lib/settings/shippingForm";

interface ShippingFormProps {
  formId: string;
  values: ShippingFormValues;
  errors: ShippingFormErrors;
  onChange: (values: ShippingFormValues) => void;
  onSubmit: () => void;
}

type TextKey = Exclude<keyof ShippingFormValues, "parcel" | "freeShippingEnabled">;

const STATE_OPTIONS = [
  { value: "", label: "Elige un estado" },
  ...MEXICAN_STATES.map((state) => ({ value: state.code, label: state.name })),
];

const Group = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <fieldset className="flex flex-col gap-4">
    <legend className={`${T_LABEL} mb-1 text-text-secondary`}>{title}</legend>
    {hint ? <p className="-mt-2 text-sm text-text-muted">{hint}</p> : null}
    {children}
  </fieldset>
);

/** Origin, free shipping, the standard box and the quote's lifetime. Pure form: the modal owns state and saving. */
const ShippingForm = ({ formId, values, errors, onChange, onSubmit }: ShippingFormProps) => {
  const bind = (key: TextKey) => ({
    value: values[key],
    onChange: (event: { target: { value: string } }) => onChange({ ...values, [key]: event.target.value }),
    error: errors[key],
    autoComplete: "off",
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-7">
      <Group title="Origen de los paquetes" hint="De aquí salen las guías. Sin origen no se pueden cotizar ni comprar.">
        <Field label="Nombre o negocio" {...bind("name")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono" inputMode="numeric" maxLength={10} {...bind("phone")} />
          <Field label="Correo (opcional)" type="email" {...bind("email")} />
        </div>
        <Field label="Calle y número" {...bind("line1")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Colonia" {...bind("district")} />
          <Field label="Ciudad" {...bind("city")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Estado"
            options={STATE_OPTIONS}
            value={values.state}
            onChange={(next) => onChange({ ...values, state: next })}
            error={errors.state}
          />
          <Field label="Código postal" inputMode="numeric" maxLength={5} {...bind("postalCode")} />
        </div>
      </Group>

      <Group title="Envío gratis">
        <Toggle
          label="Ofrecer envío gratis desde un monto"
          checked={values.freeShippingEnabled}
          onChange={(checked) => onChange({ ...values, freeShippingEnabled: checked })}
        />
        {values.freeShippingEnabled ? (
          <Field
            label="Compra mínima (MXN)"
            helper="Se compara con el subtotal en pesos, antes del envío."
            inputMode="decimal"
            containerClassName="max-w-60"
            {...bind("freeShippingPesos")}
          />
        ) : null}
      </Group>

      <Group title="Caja estándar" hint="Con estas medidas y el peso de las prendas se arma el paquete que se cotiza.">
        <div className="grid gap-4 sm:grid-cols-2">
          {PARCEL_KEYS.map((key) => (
            <Field
              key={key}
              label={PARCEL_LABELS[key]}
              inputMode="numeric"
              autoComplete="off"
              value={values.parcel[key]}
              error={errors[`parcel.${key}`]}
              onChange={(event) => onChange({ ...values, parcel: { ...values.parcel, [key]: event.target.value } })}
            />
          ))}
        </div>
      </Group>

      <Group title="Cotización">
        <Field
          label="Vigencia de la cotización (minutos)"
          helper="Entre 5 y 240. Pasado ese tiempo el cliente vuelve a cotizar."
          inputMode="numeric"
          containerClassName="max-w-60"
          {...bind("quoteTtlMinutes")}
        />
      </Group>
    </form>
  );
};

export type { ShippingFormProps };
export { ShippingForm };
