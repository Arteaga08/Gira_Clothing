"use client";

import { useState, type FormEvent } from "react";
import type { SavedAddress, Wire } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useFocusFirstField } from "@/hooks/useFocusFirstField";
import { useSubmit } from "@/hooks/useSubmit";
import { createAddress, updateAddress } from "@/lib/api/account";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { goToLogin, isSessionExpired } from "@/lib/account/sessionExpired";
import {
  EMPTY_ADDRESS_VALUES,
  addressToValues,
  validateAddress,
  valuesToCreateRequest,
  valuesToUpdateRequest,
  type AddressFormErrors,
  type AddressFormValues,
} from "@/lib/account/addressValidation";
import { STORE_ROUTES } from "@/lib/store/routes";
import { AddressFields } from "./AddressFields";

interface AddressFormProps {
  /** The address being edited, or `null` to add a new one. */
  address: Wire<SavedAddress> | null;
  /** Adding when there is already one: only then is «Usar como predeterminada» offered (the first is always the default). */
  offerDefault: boolean;
  onSaved: (addresses: Wire<SavedAddress>[], message: string) => void;
  onCancel: () => void;
}

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
      <AddressFields values={values} errors={errors} onChange={(key, value) => set(key)(value)} />
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
