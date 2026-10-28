import {
  ADDRESS_LABEL_MAX_LENGTH,
  MEXICAN_STATE_CODES,
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  type SaveAddressRequest,
  type SavedAddress,
  type UpdateAddressRequest,
  type Wire,
} from "@gira/shared";

/**
 * Client-side checks of the saved-address form. The API validates again; these save the round trip and explain.
 * Line 2 and the label are optional: empty is valid, and an emptied one is sent as `null` on edit.
 */

interface AddressFormValues {
  label: string;
  recipient: string;
  line1: string;
  line2: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  makeDefault: boolean;
}

type AddressFormErrors = Partial<Record<Exclude<keyof AddressFormValues, "makeDefault">, string>>;

const PHONE_LENGTH = 10;
const POSTAL_CODE_LENGTH = 5;
const MARKUP = /[<>]/;

const EMPTY_ADDRESS_VALUES: AddressFormValues = {
  label: "",
  recipient: "",
  line1: "",
  line2: "",
  district: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
  makeDefault: false,
};

/** Digits only, capped, as the person types or pastes. */
const sanitizeDigits = (value: string, max: number): string => value.replace(/\D/g, "").slice(0, max);
const sanitizeAddressPhone = (value: string): string => sanitizeDigits(value, PHONE_LENGTH);
const sanitizePostalCode = (value: string): string => sanitizeDigits(value, POSTAL_CODE_LENGTH);

const textError = (value: string, min: number, max: number, missing: string): string | null => {
  const text = value.trim();
  if (text === "") return missing;
  if (text.length < min) return `Escribe al menos ${String(min)} caracteres.`;
  if (text.length > max) return `No puede pasar de ${String(max)} caracteres.`;
  if (MARKUP.test(text)) return "Hay caracteres no permitidos.";
  return null;
};

const optionalTextError = (value: string, max: number): string | null => {
  const text = value.trim();
  if (text.length > max) return `No puede pasar de ${String(max)} caracteres.`;
  if (MARKUP.test(text)) return "Hay caracteres no permitidos.";
  return null;
};

const validateAddress = (values: AddressFormValues): AddressFormErrors => {
  const errors: AddressFormErrors = {};
  const check = (key: keyof AddressFormErrors, message: string | null) => {
    if (message) errors[key] = message;
  };
  check("label", optionalTextError(values.label, ADDRESS_LABEL_MAX_LENGTH));
  check("recipient", textError(values.recipient, 2, 120, "Falta quién recibe."));
  check("line1", textError(values.line1, 3, 200, "Falta la calle y el número."));
  check("line2", optionalTextError(values.line2, 200));
  check("district", textError(values.district, 2, 120, "Falta la colonia."));
  check("city", textError(values.city, 2, 120, "Falta la ciudad."));
  check("state", MEXICAN_STATE_CODES.includes(values.state) ? null : "Elige un estado.");
  check("postalCode", POSTAL_CODE_PATTERN.test(values.postalCode) ? null : "El código postal debe tener 5 dígitos.");
  check("phone", PHONE_PATTERN.test(values.phone) ? null : `Escribe los ${String(PHONE_LENGTH)} dígitos de tu celular, sin espacios ni guiones.`);
  return errors;
};

const addressToValues = (address: Wire<SavedAddress>): AddressFormValues => ({
  label: address.label ?? "",
  recipient: address.recipient,
  line1: address.line1,
  line2: address.line2 ?? "",
  district: address.district,
  city: address.city,
  state: address.state,
  postalCode: address.postalCode,
  phone: address.phone,
  makeDefault: false,
});

/** Creating: what was left empty is simply not sent. */
const valuesToCreateRequest = (values: AddressFormValues): SaveAddressRequest => ({
  recipient: values.recipient.trim(),
  line1: values.line1.trim(),
  district: values.district.trim(),
  city: values.city.trim(),
  state: values.state,
  postalCode: values.postalCode,
  country: "MX",
  phone: values.phone,
  ...(values.label.trim() === "" ? {} : { label: values.label.trim() }),
  ...(values.line2.trim() === "" ? {} : { line2: values.line2.trim() }),
  ...(values.makeDefault ? { makeDefault: true } : {}),
});

/** Editing: an emptied label or line 2 becomes `null`, which tells the API to clear it. */
const valuesToUpdateRequest = (values: AddressFormValues): UpdateAddressRequest => ({
  label: values.label.trim() === "" ? null : values.label.trim(),
  recipient: values.recipient.trim(),
  line1: values.line1.trim(),
  line2: values.line2.trim() === "" ? null : values.line2.trim(),
  district: values.district.trim(),
  city: values.city.trim(),
  state: values.state,
  postalCode: values.postalCode,
  phone: values.phone,
});

export type { AddressFormValues, AddressFormErrors };
export {
  EMPTY_ADDRESS_VALUES,
  sanitizeAddressPhone,
  sanitizePostalCode,
  validateAddress,
  addressToValues,
  valuesToCreateRequest,
  valuesToUpdateRequest,
};
