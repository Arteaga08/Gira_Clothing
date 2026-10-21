"use client";

import type { Settings, ShippingSettings, Wire } from "@gira/shared";
import { useId, useState } from "react";
import { Notice } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { settingsClient } from "@/lib/api/adminSettings";
import { isApiError } from "@/lib/api/ApiError";
import {
  toShippingBody,
  validateShippingForm,
  valuesFromSettings,
  type ShippingFormErrors,
  type ShippingFormValues,
} from "@/lib/settings/shippingForm";
import { SectionModal } from "./SectionModal";
import { ShippingForm } from "./ShippingForm";

interface ShippingModalProps {
  shipping: Wire<ShippingSettings>;
  onClose: () => void;
  onSaved: (settings: Wire<Settings>) => void;
}

const GENERIC_ERROR = "No se pudo guardar la configuración de envío.";

/** Edits the shipping section in one PATCH; it never touches IVA, currency or the rest. */
const ShippingModal = ({ shipping, onClose, onSaved }: ShippingModalProps) => {
  const { toast } = useToast();
  const formId = `shipping-form-${useId()}`;
  const [baseline] = useState(() => valuesFromSettings(shipping));
  const [values, setValues] = useState<ShippingFormValues>(baseline);
  const [errors, setErrors] = useState<ShippingFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    const found = validateShippingForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setError(null);
    setSaving(true);
    try {
      const settings = await settingsClient.updateShipping(toShippingBody(values));
      toast({ variant: "success", title: "Configuración de envío guardada" });
      onSaved(settings);
      onClose();
    } catch (failure) {
      setSaving(false);
      setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
    }
  };

  return (
    <SectionModal
      title="Envío"
      formId={formId}
      dirty={JSON.stringify(values) !== JSON.stringify(baseline)}
      saving={saving}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        {error ? (
          <Notice variant="danger" title="No se pudo guardar">
            <p>{error}</p>
          </Notice>
        ) : null}
        <ShippingForm
          formId={formId}
          values={values}
          errors={errors}
          onChange={(next) => {
            setError(null);
            setValues(next);
          }}
          onSubmit={() => void submit()}
        />
      </div>
    </SectionModal>
  );
};

export type { ShippingModalProps };
export { ShippingModal };
