import { MEXICAN_STATE_CODES, POSTAL_CODE_PATTERN, type ShippingAddress } from "@gira/shared";

type AddressErrors = Partial<Record<keyof ShippingAddress, string>>;

const minLength = (min: number) => `Escribe al menos ${min} caracteres.`;
const maxLength = (max: number) => `Máximo ${max} caracteres.`;

/** Same limits as adminOrderValidator.ts in the API, so the form never sends what the API will reject. */
const LIMITS = {
  recipient: { min: 2, max: 120 },
  line1: { min: 3, max: 200 },
  district: { min: 2, max: 120 },
  city: { min: 2, max: 120 },
} as const;

const MAX_LINE2 = 200;

const checkText = (value: string, { min, max }: { min: number; max: number }): string | undefined => {
  const length = value.trim().length;
  if (length < min) return minLength(min);
  if (length > max) return maxLength(max);
  return undefined;
};

/** Client-side mirror of the API's address validation: field → Spanish message. Empty object means valid. */
const validateAddress = (address: ShippingAddress): AddressErrors => {
  const errors: AddressErrors = {};
  const set = <K extends keyof ShippingAddress>(key: K, message: string | undefined) => {
    if (message) errors[key] = message;
  };

  set("recipient", checkText(address.recipient, LIMITS.recipient));
  set("line1", checkText(address.line1, LIMITS.line1));
  set("district", checkText(address.district, LIMITS.district));
  set("city", checkText(address.city, LIMITS.city));
  if ((address.line2 ?? "").trim().length > MAX_LINE2) set("line2", maxLength(MAX_LINE2));
  if (!MEXICAN_STATE_CODES.includes(address.state)) set("state", "Elige un estado de la lista.");
  if (!POSTAL_CODE_PATTERN.test(address.postalCode.trim())) set("postalCode", "El código postal tiene 5 dígitos.");
  if (address.country !== "MX") set("country", "Solo hacemos envíos dentro de México.");
  return errors;
};

export { validateAddress };
export type { AddressErrors };
