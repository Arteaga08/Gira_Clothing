import type { SavedAddress, ShippingAddress, ShippingDestination, Wire } from "@gira/shared";
import { validateAddress, type AddressFormErrors, type AddressFormValues } from "@/lib/account/addressValidation";

/** Where the order goes and the phone the carrier calls: the two things `POST /orders` takes from the chosen address. */
interface CheckoutAddress {
  address: ShippingAddress;
  phone: string;
}

const fromSaved = (saved: Wire<SavedAddress>): CheckoutAddress => ({
  address: {
    recipient: saved.recipient,
    line1: saved.line1,
    ...(saved.line2 ? { line2: saved.line2 } : {}),
    district: saved.district,
    city: saved.city,
    state: saved.state,
    postalCode: saved.postalCode,
    country: saved.country,
  },
  phone: saved.phone,
});

/** The one-off address typed in the checkout. It is used for this order and never saved to the account. */
const fromValues = (values: AddressFormValues): CheckoutAddress => ({
  address: {
    recipient: values.recipient.trim(),
    line1: values.line1.trim(),
    ...(values.line2.trim() ? { line2: values.line2.trim() } : {}),
    district: values.district.trim(),
    city: values.city.trim(),
    state: values.state,
    postalCode: values.postalCode,
    country: "MX",
  },
  phone: values.phone,
});

const destinationOf = ({ postalCode, state, city }: ShippingAddress): ShippingDestination => ({ postalCode, state, city });

/** Same rules as the saved-address form, minus the nickname the checkout does not have. */
const validateCheckoutValues = (values: AddressFormValues): AddressFormErrors => {
  const { label: _label, ...errors } = validateAddress({ ...values, label: "" });
  return errors;
};

export type { CheckoutAddress };
export { fromSaved, fromValues, destinationOf, validateCheckoutValues };
