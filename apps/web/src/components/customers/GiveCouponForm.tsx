"use client";

import { COUPON_MESSAGE_MAX } from "@gira/shared";
import { useId, type FormEvent } from "react";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import { NB_CONTROL } from "@/components/ui/styles";
import { cn } from "@/lib/cn";
import type { CouponKind } from "@/lib/coupons/couponForm";
import type { GiveCouponErrors, GiveCouponValues } from "@/lib/customers/giveCouponForm";

interface GiveCouponFormProps {
  /** The footer's submit button points here with its `form` attribute. */
  formId: string;
  firstName: string;
  email: string;
  values: GiveCouponValues;
  errors: GiveCouponErrors;
  /** The API's own message (Spanish) or the generic one. */
  error: string | null;
  onChange: (values: GiveCouponValues) => void;
  onSubmit: () => void;
}

const TYPE_OPTIONS = [
  { value: "percent", label: "Porcentaje" },
  { value: "fixed", label: "Monto fijo (MXN)" },
];

/** The personal coupon's fields. Controlled: the modal owns the values because the submit button lives in its footer. */
const GiveCouponForm = ({ formId, firstName, email, values, errors, error, onChange, onSubmit }: GiveCouponFormProps) => {
  const set = (patch: Partial<GiveCouponValues>) => onChange({ ...values, ...patch });
  const messageId = useId();
  const hasErrors = Object.values(errors).some(Boolean);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {hasErrors || error ? (
        <Notice variant="danger" title="No se pudo dar el cupón">
          <p>{error ?? "Revisa los campos marcados."}</p>
        </Notice>
      ) : null}

      <Notice variant="info" title="Cupón personal">
        <p>
          Solo {firstName} puede usarlo, una sola vez. Le llega a {email}.
        </p>
      </Notice>

      <Field
        label="Código"
        value={values.code}
        error={errors.code}
        helper="Lo que escribe al pagar. Letras sin acento, números y guiones."
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={24}
        className="font-mono"
        onChange={(event) => set({ code: event.target.value.toUpperCase() })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Tipo de descuento"
          options={TYPE_OPTIONS}
          value={values.discountType}
          onChange={(next) => set({ discountType: next as CouponKind })}
        />
        {values.discountType === "percent" ? (
          <Field
            label="Porcentaje (%)"
            inputMode="numeric"
            value={values.percentOff}
            error={errors.percentOff}
            className="font-mono"
            onChange={(event) => set({ percentOff: event.target.value })}
          />
        ) : (
          <Field
            label="Monto (MXN)"
            inputMode="decimal"
            value={values.amountOff}
            error={errors.amountOff}
            className="font-mono"
            onChange={(event) => set({ amountOff: event.target.value })}
          />
        )}
      </div>
      <Field
        label="Compra mínima (MXN, opcional)"
        inputMode="decimal"
        value={values.minSubtotal}
        error={errors.minSubtotal}
        helper="Sobre el subtotal de los productos. Vacío = sin mínimo."
        className="font-mono"
        onChange={(event) => set({ minSubtotal: event.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Inicia (opcional)"
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
          value={values.startsAt}
          error={errors.startsAt}
          helper="Desde las 00:00, hora de México."
          className="font-mono"
          onChange={(event) => set({ startsAt: event.target.value })}
        />
        <Field
          label="Vence (opcional)"
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
          value={values.endsAt}
          error={errors.endsAt}
          helper="Hasta las 23:59, hora de México."
          className="font-mono"
          onChange={(event) => set({ endsAt: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={messageId} className="font-mono text-2xs font-bold uppercase tracking-wide text-text-secondary">
          {`Mensaje para ${firstName} (opcional)`}
        </label>
        <textarea
          id={messageId}
          rows={3}
          value={values.message}
          maxLength={COUPON_MESSAGE_MAX}
          placeholder="Gracias por estar con nosotros desde el primer día"
          {...(errors.message ? { "aria-invalid": true } : {})}
          onChange={(event) => set({ message: event.target.value })}
          className={cn(NB_CONTROL, "resize-y px-3 py-2 text-sm", errors.message && "border-danger")}
        />
        <p className={cn("text-xs", errors.message ? "text-danger" : "text-text-secondary")}>
          {errors.message ?? `Sale en el correo que recibe. ${values.message.length}/${COUPON_MESSAGE_MAX}`}
        </p>
      </div>
    </form>
  );
};

export type { GiveCouponFormProps };
export { GiveCouponForm };
