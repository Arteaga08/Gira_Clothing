import {
  MEXICAN_STATE_CODES,
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  type ShippingParcelSettings,
  type ShippingSettings,
  type Wire,
} from "@gira/shared";
import type { ShippingSettingsBody } from "@/lib/api/adminSettings";
import { centsToPesosInput, pesosToCents } from "@/lib/coupons/money";

/**
 * The Envío form of Ajustes: origin of the parcels, free shipping, the standard
 * box and how long a quote lives. Every limit mirrors settingsValidator.ts in
 * the API, so the form never sends what the API will reject.
 */

type ParcelKey = keyof ShippingParcelSettings;

interface ShippingFormValues {
  name: string;
  phone: string;
  email: string;
  line1: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  freeShippingEnabled: boolean;
  freeShippingPesos: string;
  parcel: Record<ParcelKey, string>;
  quoteTtlMinutes: string;
}

type ShippingFormField = Exclude<keyof ShippingFormValues, "parcel" | "freeShippingEnabled"> | `parcel.${ParcelKey}`;
type ShippingFormErrors = Partial<Record<ShippingFormField, string>>;

interface IntRange {
  min: number;
  max: number;
}

const PARCEL_LIMITS: Readonly<Record<ParcelKey, IntRange>> = {
  tareGrams: { min: 0, max: 5_000 },
  boxLengthCm: { min: 1, max: 200 },
  boxWidthCm: { min: 1, max: 200 },
  boxHeightCm: { min: 1, max: 200 },
  extraUnitHeightCm: { min: 0, max: 100 },
  maxWeightGrams: { min: 1, max: 70_000 },
};

const PARCEL_LABELS: Readonly<Record<ParcelKey, string>> = {
  tareGrams: "Peso del empaque (g)",
  boxLengthCm: "Largo de la caja (cm)",
  boxWidthCm: "Ancho de la caja (cm)",
  boxHeightCm: "Alto de la caja (cm)",
  extraUnitHeightCm: "Alto extra por prenda (cm)",
  maxWeightGrams: "Peso máximo por paquete (g)",
};

const PARCEL_KEYS = Object.keys(PARCEL_LIMITS) as ParcelKey[];
const QUOTE_TTL: IntRange = { min: 5, max: 240 };
const MAX_FREE_SHIPPING_CENTS = 100_000_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEXT_LIMITS = {
  name: { min: 2, max: 120 },
  line1: { min: 3, max: 200 },
  district: { min: 2, max: 120 },
  city: { min: 2, max: 120 },
} as const;

const valuesFromSettings = (shipping: Wire<ShippingSettings>): ShippingFormValues => ({
  name: shipping.origin?.name ?? "",
  phone: shipping.origin?.phone ?? "",
  email: shipping.origin?.email ?? "",
  line1: shipping.origin?.line1 ?? "",
  district: shipping.origin?.district ?? "",
  city: shipping.origin?.city ?? "",
  state: shipping.origin?.state ?? "",
  postalCode: shipping.origin?.postalCode ?? "",
  freeShippingEnabled: shipping.freeShippingThreshold !== null,
  freeShippingPesos: shipping.freeShippingThreshold === null ? "" : centsToPesosInput(shipping.freeShippingThreshold),
  parcel: Object.fromEntries(PARCEL_KEYS.map((key) => [key, String(shipping.parcel[key])])) as Record<ParcelKey, string>,
  quoteTtlMinutes: String(shipping.quoteTtlMinutes),
});

const textError = (value: string, { min, max }: IntRange): string | undefined => {
  const length = value.trim().length;
  if (length < min) return `Escribe al menos ${min} caracteres.`;
  if (length > max) return `Máximo ${max} caracteres.`;
  return undefined;
};

/** Whole number inside the range, or the message to show. */
const intError = (value: string, { min, max }: IntRange): string | undefined => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return "Escribe un número entero.";
  const n = Number(trimmed);
  if (n < min || n > max) return `Debe estar entre ${min} y ${max}.`;
  return undefined;
};

const validateShippingForm = (values: ShippingFormValues): ShippingFormErrors => {
  const errors: ShippingFormErrors = {};
  const set = (field: ShippingFormField, message: string | undefined) => {
    if (message) errors[field] = message;
  };

  set("name", textError(values.name, TEXT_LIMITS.name));
  if (!PHONE_PATTERN.test(values.phone.trim())) set("phone", "El teléfono tiene 10 dígitos.");
  const email = values.email.trim();
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 160)) set("email", "Escribe un correo válido.");
  set("line1", textError(values.line1, TEXT_LIMITS.line1));
  set("district", textError(values.district, TEXT_LIMITS.district));
  set("city", textError(values.city, TEXT_LIMITS.city));
  if (!MEXICAN_STATE_CODES.includes(values.state)) set("state", "Elige un estado de la lista.");
  if (!POSTAL_CODE_PATTERN.test(values.postalCode.trim())) set("postalCode", "El código postal tiene 5 dígitos.");

  if (values.freeShippingEnabled) {
    const cents = pesosToCents(values.freeShippingPesos);
    if (cents === null) set("freeShippingPesos", "Escribe un monto en pesos, como 1500 o 1500.50.");
    else if (cents > MAX_FREE_SHIPPING_CENTS) set("freeShippingPesos", "El monto es demasiado alto.");
  }

  for (const key of PARCEL_KEYS) set(`parcel.${key}`, intError(values.parcel[key], PARCEL_LIMITS[key]));
  set("quoteTtlMinutes", intError(values.quoteTtlMinutes, QUOTE_TTL));
  return errors;
};

/** Only call with values that passed `validateShippingForm`. */
const toShippingBody = (values: ShippingFormValues): ShippingSettingsBody => {
  const email = values.email.trim().toLowerCase();
  const parcel = (key: ParcelKey): number => Number(values.parcel[key].trim());
  return {
    origin: {
      name: values.name.trim(),
      phone: values.phone.trim(),
      ...(email ? { email } : {}),
      line1: values.line1.trim(),
      district: values.district.trim(),
      city: values.city.trim(),
      state: values.state,
      postalCode: values.postalCode.trim(),
    },
    freeShippingThreshold: values.freeShippingEnabled ? pesosToCents(values.freeShippingPesos) : null,
    parcel: {
      tareGrams: parcel("tareGrams"),
      boxLengthCm: parcel("boxLengthCm"),
      boxWidthCm: parcel("boxWidthCm"),
      boxHeightCm: parcel("boxHeightCm"),
      extraUnitHeightCm: parcel("extraUnitHeightCm"),
      maxWeightGrams: parcel("maxWeightGrams"),
    },
    quoteTtlMinutes: Number(values.quoteTtlMinutes.trim()),
  };
};

export type { ShippingFormValues, ShippingFormErrors, ShippingFormField, ParcelKey };
export { PARCEL_KEYS, PARCEL_LABELS, valuesFromSettings, validateShippingForm, toShippingBody };
