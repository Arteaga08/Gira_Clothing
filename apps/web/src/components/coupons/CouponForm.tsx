"use client";

import { useId, type FormEvent } from "react";
import { COUPON_NAME_MAX } from "@gira/shared";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import type { CouponFormErrors, CouponFormValues, CouponKind } from "@/lib/coupons/couponForm";

interface CouponFormProps {
  /** The footer's submit button points here with its `form` attribute. */
  formId: string;
  mode: "create" | "edit";
  values: CouponFormValues;
  errors: CouponFormErrors;
  /** The API's own message (Spanish) or the generic one. */
  error: string | null;
  /** Code, type and value are read-only once the coupon has redemptions. */
  locked: boolean;
  redeemedCount: number;
  onChange: (values: CouponFormValues) => void;
  onSubmit: () => void;
}

const TYPE_OPTIONS = [
  { value: "percent", label: "Porcentaje" },
  { value: "fixed", label: "Monto fijo (MXN)" },
];

/**
 * The coupon's fields. Controlled: the modal owns the values because the submit
 * button lives in its pinned footer, outside this form.
 */
const CouponForm = ({ formId, mode, values, errors, error, locked, redeemedCount, onChange, onSubmit }: CouponFormProps) => {
  const lockedHelper = `Bloqueado: ya tiene ${redeemedCount} ${redeemedCount === 1 ? "canje" : "canjes"}.`;
  const set = (patch: Partial<CouponFormValues>) => onChange({ ...values, ...patch });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const summaryId = useId();

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {hasErrors || error ? (
        <Notice
          variant="danger"
          title={mode === "edit" ? "No se pudo guardar el cupón" : "No se pudo crear el cupón"}
        >
          <p id={summaryId}>{error ?? "Revisa los campos marcados."}</p>
        </Notice>
      ) : null}
      {locked ? (
        <Notice variant="info" title="Este cupón ya se usó">
          <p>Código y descuento no se pueden cambiar; el resto sí.</p>
        </Notice>
      ) : null}

      <Field
        label="Código"
        value={values.code}
        error={errors.code}
        helper={locked ? lockedHelper : "Letras mayúsculas, números y guiones. De 4 a 24 caracteres."}
        readOnly={locked}
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={24}
        className="font-mono"
        onChange={(event) => set({ code: event.target.value.toUpperCase() })}
      />
      <Field
        label="Nombre interno"
        value={values.name}
        error={errors.name}
        helper="Solo lo ves tú, no aparece en la tienda."
        maxLength={COUPON_NAME_MAX}
        onChange={(event) => set({ name: event.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Tipo de descuento"
          options={TYPE_OPTIONS}
          value={values.discountType}
          disabled={locked}
          {...(locked ? { helper: lockedHelper } : {})}
          onChange={(next) => set({ discountType: next as CouponKind })}
        />
        {values.discountType === "percent" ? (
          <Field
            label="Porcentaje (%)"
            inputMode="numeric"
            value={values.percentOff}
            error={errors.percentOff}
            readOnly={locked}
            className="font-mono"
            onChange={(event) => set({ percentOff: event.target.value })}
          />
        ) : (
          <Field
            label="Monto (MXN)"
            inputMode="decimal"
            value={values.amountOff}
            error={errors.amountOff}
            readOnly={locked}
            className="font-mono"
            onChange={(event) => set({ amountOff: event.target.value })}
          />
        )}
      </div>
      <Field
        label="Compra mínima (MXN)"
        inputMode="decimal"
        value={values.minSubtotal}
        error={errors.minSubtotal}
        helper="Sobre el subtotal de los productos. Déjala vacía para no pedir mínimo."
        className="font-mono"
        onChange={(event) => set({ minSubtotal: event.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Inicia"
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
          value={values.startsAt}
          error={errors.startsAt}
          helper="Desde las 00:00, hora de México."
          className="font-mono"
          onChange={(event) => set({ startsAt: event.target.value })}
        />
        <Field
          label="Termina"
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
          value={values.endsAt}
          error={errors.endsAt}
          helper="Hasta las 23:59, hora de México."
          className="font-mono"
          onChange={(event) => set({ endsAt: event.target.value })}
        />
      </div>
      <Field
        label="Tope total de canjes"
        inputMode="numeric"
        value={values.maxRedemptions}
        error={errors.maxRedemptions}
        helper="Cuántas veces se puede usar entre todos los clientes. Vacío = sin tope."
        className="font-mono"
        onChange={(event) => set({ maxRedemptions: event.target.value })}
      />
      <p className="text-xs text-text-secondary">Cada cliente puede usarlo una sola vez. Solo clientes con cuenta.</p>
    </form>
  );
};

export type { CouponFormProps };
export { CouponForm };
