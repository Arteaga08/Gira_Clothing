"use client";

import { useState, type FormEvent } from "react";
import { CFDI_USES, FISCAL_REGIMES, type BillingInfo, type Wire } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import { useFocusFirstField } from "@/hooks/useFocusFirstField";
import { useSubmit } from "@/hooks/useSubmit";
import { saveBilling } from "@/lib/api/account";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { goToLogin, isSessionExpired } from "@/lib/account/sessionExpired";
import {
  EMPTY_BILLING_VALUES,
  billingToValues,
  sanitizeFiscalPostalCode,
  sanitizeRfc,
  validateBilling,
  valuesToBillingRequest,
  type BillingFormErrors,
  type BillingFormValues,
} from "@/lib/account/billingValidation";
import { STORE_ROUTES } from "@/lib/store/routes";

interface BillingFormProps {
  billing: Wire<BillingInfo> | null;
  onSaved: (billing: Wire<BillingInfo>) => void;
  onCancel: () => void;
}

const REGIME_OPTIONS = FISCAL_REGIMES.map((entry) => ({ value: entry.code, label: `${entry.code} · ${entry.name}` }));
const CFDI_OPTIONS = CFDI_USES.map((entry) => ({ value: entry.code, label: `${entry.code} · ${entry.name}` }));

/** Tax-data form: five required fields copied from the constancia de situación fiscal. It takes focus on the RFC when it opens. */
const BillingForm = ({ billing, onSaved, onCancel }: BillingFormProps) => {
  const [values, setValues] = useState<BillingFormValues>(() => (billing ? billingToValues(billing) : EMPTY_BILLING_VALUES));
  const [errors, setErrors] = useState<BillingFormErrors>({});
  const { pending, error, setError, run } = useSubmit();
  const formRef = useFocusFirstField();

  const set = (key: keyof BillingFormValues) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateBilling(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void run(
      async () => {
        onSaved(await saveBilling(valuesToBillingRequest(values)));
      },
      {
        onError: (failure) => {
          if (isSessionExpired(failure)) goToLogin(STORE_ROUTES.billing);
          else setError(authFailureMessage(failure));
        },
      },
    );
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-label="Datos fiscales" className="grid gap-4">
      {error ? (
        <Notice variant="danger" title="No pudimos guardar">
          {error}
        </Notice>
      ) : null}
      <Field
        label="RFC"
        autoComplete="off"
        spellCheck={false}
        placeholder="LOMM910312AB1"
        value={values.rfc}
        error={errors.rfc}
        onChange={(e) => set("rfc")(sanitizeRfc(e.target.value))}
      />
      <Field
        label="Nombre o razón social"
        autoComplete="organization"
        helper="Tal como aparece en tu constancia de situación fiscal."
        value={values.legalName}
        error={errors.legalName}
        onChange={(e) => set("legalName")(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Régimen fiscal" options={REGIME_OPTIONS} value={values.fiscalRegime} error={errors.fiscalRegime} onChange={set("fiscalRegime")} />
        <SelectField label="Uso de CFDI" options={CFDI_OPTIONS} value={values.cfdiUse} error={errors.cfdiUse} onChange={set("cfdiUse")} />
      </div>
      <Field
        label="Código postal fiscal"
        inputMode="numeric"
        autoComplete="off"
        helper="El de tu constancia; puede ser distinto al de envío."
        value={values.postalCode}
        error={errors.postalCode}
        onChange={(e) => set("postalCode")(sanitizeFiscalPostalCode(e.target.value))}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={pending}>
          Guardar datos fiscales
        </Button>
        <Button type="button" variant="danger" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
};

export { BillingForm };
