"use client";

import type { Settings, Wire } from "@gira/shared";
import { useId, useState, type FormEvent } from "react";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { settingsClient } from "@/lib/api/adminSettings";
import { isApiError } from "@/lib/api/ApiError";
import { bpsToPercentInput, formatTaxRate, parseTaxPercent } from "@/lib/settings/tax";
import { SectionModal } from "./SectionModal";

interface TaxModalProps {
  rateBps: number;
  onClose: () => void;
  onSaved: (settings: Wire<Settings>) => void;
}

const GENERIC_ERROR = "No se pudo guardar la tasa de IVA.";

/**
 * Edits the IVA rate. Prices already include IVA and every order freezes its
 * rate, so the notice says exactly what a change does: the tax breakdown of
 * orders created from now on, nothing else.
 */
const TaxModal = ({ rateBps, onClose, onSaved }: TaxModalProps) => {
  const { toast } = useToast();
  const formId = `tax-form-${useId()}`;
  const baseline = bpsToPercentInput(rateBps);
  const [value, setValue] = useState(baseline);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const parsed = parseTaxPercent(value);
    if ("error" in parsed) {
      setFieldError(parsed.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const settings = await settingsClient.updateTax(parsed.rateBps);
      toast({ variant: "success", title: `IVA guardado: ${formatTaxRate(settings.tax.rateBps)}` });
      onSaved(settings);
      onClose();
    } catch (failure) {
      setSaving(false);
      setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
    }
  };

  return (
    <SectionModal title="Tasa de IVA" formId={formId} dirty={value.trim() !== baseline} saving={saving} onClose={onClose}>
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
        <Notice variant="info" title="Solo para pedidos nuevos">
          <p>
            Los precios ya incluyen IVA: cambiar la tasa solo cambia el desglose de IVA de los pedidos que se creen
            después de guardar. Los pedidos existentes conservan su tasa y su total.
          </p>
        </Notice>
        {error ? (
          <Notice variant="danger" title="No se pudo guardar">
            <p>{error}</p>
          </Notice>
        ) : null}
        <Field
          label="Tasa de IVA (%)"
          helper={`Vigente: ${formatTaxRate(rateBps)}. Hasta dos decimales.`}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          error={fieldError ?? undefined}
          onChange={(event) => {
            setFieldError(null);
            setValue(event.target.value);
          }}
          containerClassName="max-w-48"
        />
      </form>
    </SectionModal>
  );
};

export type { TaxModalProps };
export { TaxModal };
