"use client";

import { useState, type FormEvent } from "react";
import { ADDRESS_LABEL_MAX_LENGTH, MEXICAN_STATES, type SavedAddress, type Wire } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import { useFocusFirstField } from "@/hooks/useFocusFirstField";
import { useSubmit } from "@/hooks/useSubmit";
import { createAddress, updateAddress } from "@/lib/api/account";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { goToLogin, isSessionExpired } from "@/lib/account/sessionExpired";
import {
  EMPTY_ADDRESS_VALUES,
  addressToValues,
  sanitizeAddressPhone,
  sanitizePostalCode,
  validateAddress,
  valuesToCreateRequest,
  valuesToUpdateRequest,
  type AddressFormErrors,
  type AddressFormValues,
} from "@/lib/account/addressValidation";
import { STORE_ROUTES } from "@/lib/store/routes";

interface AddressFormProps {
  /** The address being edited, or `null` to add a new one. */
  address: Wire<SavedAddress> | null;
  /** Adding when there is already one: only then is «Usar como predeterminada» offered (the first is always the default). */
  offerDefault: boolean;
  onSaved: (addresses: Wire<SavedAddress>[], message: string) => void;
  onCancel: () => void;
}

const STATE_OPTIONS = MEXICAN_STATES.map((state) => ({ value: state.code, label: state.name }));

/** Add / edit form of a saved address. It takes focus on its first field when it opens. */
const AddressForm = ({ address, offerDefault, onSaved, onCancel }: AddressFormProps) => {
  const [values, setValues] = useState<AddressFormValues>(() => (address ? addressToValues(address) : EMPTY_ADDRESS_VALUES));
  const [errors, setErrors] = useState<AddressFormErrors>({});
  const { pending, error, setError, run } = useSubmit();
  const formRef = useFocusFirstField();

  const set = (key: keyof AddressFormErrors) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateAddress(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void run(
      async () => {
        if (address) onSaved(await updateAddress(address.id, valuesToUpdateRequest(values)), "Guardamos los cambios de la dirección.");
        else onSaved(await createAddress(valuesToCreateRequest(values)), "Guardamos tu dirección.");
      },
      {
        onError: (failure) => {
          if (isSessionExpired(failure)) goToLogin(STORE_ROUTES.addresses);
          else setError(authFailureMessage(failure));
        },
      },
    );
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-label={address ? "Editar dirección" : "Agregar dirección"} className="grid gap-4">
      {error ? (
        <Notice variant="danger" title="No pudimos guardar">
          {error}
        </Notice>
      ) : null}
      <Field
        label="Nombre de la dirección (opcional)"
        placeholder="Casa"
        maxLength={ADDRESS_LABEL_MAX_LENGTH}
        value={values.label}
        error={errors.label}
        onChange={(e) => set("label")(e.target.value)}
      />
      <Field label="Quién recibe" autoComplete="name" value={values.recipient} error={errors.recipient} onChange={(e) => set("recipient")(e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Calle y número" autoComplete="address-line1" value={values.line1} error={errors.line1} onChange={(e) => set("line1")(e.target.value)} />
        <Field
          label="Interior, referencias (opcional)"
          autoComplete="address-line2"
          value={values.line2}
          error={errors.line2}
          onChange={(e) => set("line2")(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Colonia" value={values.district} error={errors.district} onChange={(e) => set("district")(e.target.value)} />
        <Field label="Ciudad" autoComplete="address-level2" value={values.city} error={errors.city} onChange={(e) => set("city")(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Estado" options={STATE_OPTIONS} value={values.state} error={errors.state} onChange={set("state")} />
        <Field
          label="Código postal"
          inputMode="numeric"
          autoComplete="postal-code"
          value={values.postalCode}
          error={errors.postalCode}
          onChange={(e) => set("postalCode")(sanitizePostalCode(e.target.value))}
        />
      </div>
      <Field
        label="Celular"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        helper="10 dígitos: la paquetería lo usa para avisarte de la entrega."
        value={values.phone}
        error={errors.phone}
        onChange={(e) => set("phone")(sanitizeAddressPhone(e.target.value))}
      />
      {address === null && offerDefault ? (
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={values.makeDefault}
            onChange={(event) => setValues((current) => ({ ...current, makeDefault: event.target.checked }))}
            className="h-6 w-6 shrink-0 cursor-pointer accent-brand"
          />
          Usar como mi dirección predeterminada
        </label>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={pending}>
          Guardar dirección
        </Button>
        <Button type="button" variant="danger" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
};

export { AddressForm };
