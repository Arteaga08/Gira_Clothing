"use client";

import { useCallback, useMemo, useState } from "react";
import type { SavedAddress, Wire } from "@gira/shared";
import { EMPTY_ADDRESS_VALUES, type AddressFormErrors, type AddressFormValues } from "@/lib/account/addressValidation";
import { fromSaved, fromValues, validateCheckoutValues, type CheckoutAddress } from "@/lib/checkout/checkoutAddress";

const NEW_ADDRESS = "new";

/**
 * Which address the order goes to: one of the saved ones (the default is preselected) or a one-off
 * address typed here, which is used for this order only and never saved to the account.
 */
const useAddressChoice = (addresses: Wire<SavedAddress>[]) => {
  const [choice, setChoice] = useState<string>(() => addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? NEW_ADDRESS);
  const [values, setValues] = useState<AddressFormValues>(EMPTY_ADDRESS_VALUES);
  const [errors, setErrors] = useState<AddressFormErrors>({});

  const saved = addresses.find((a) => a.id === choice);

  const setValue = useCallback((key: keyof AddressFormErrors, value: string): void => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }, []);

  /** The chosen address when it is complete, without showing errors (used to gate the pay button). */
  const current = useMemo<CheckoutAddress | null>(() => {
    if (saved) return fromSaved(saved);
    return Object.keys(validateCheckoutValues(values)).length === 0 ? fromValues(values) : null;
  }, [saved, values]);

  /** Same, but a half-typed address shows its errors: this is what «Ver opciones de envío» calls. */
  const resolve = useCallback((): CheckoutAddress | null => {
    if (saved) return fromSaved(saved);
    const found = validateCheckoutValues(values);
    setErrors(found);
    return Object.keys(found).length === 0 ? fromValues(values) : null;
  }, [saved, values]);

  /** Changes whenever the address does, so a quote made for the previous one can be dropped. */
  const identity = saved ? `saved:${saved.id}` : `new:${JSON.stringify(values)}`;

  return { choice, setChoice, values, errors, setValue, current, resolve, identity };
};

export { NEW_ADDRESS, useAddressChoice };
