import { BIRTH_DATE_MIN, CITY_MAX_LENGTH, PHONE_PATTERN, type AccountProfile, type UpdateProfileRequest, type Wire } from "@gira/shared";
import { nameError } from "@/lib/auth/validation";

/**
 * Client-side checks of the profile form. The API validates again; these save the round trip and
 * explain. Phone, birth date and city are optional: empty is valid and is sent as `null`.
 */

interface ProfileFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: string;
  city: string;
}

type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

const PHONE_LENGTH = 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today as YYYY-MM-DD in the BROWSER's zone: a birth date is a calendar day, and UTC is already tomorrow by evening in Mexico. */
const todayIso = (now: Date = new Date()): string => {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
};

/** Keeps digits only and caps the length, as the person types or pastes. */
const sanitizePhone = (value: string): string => value.replace(/\D/g, "").slice(0, PHONE_LENGTH);

const phoneError = (value: string): string | null =>
  value === "" || PHONE_PATTERN.test(value) ? null : `Escribe los ${String(PHONE_LENGTH)} dígitos de tu celular, sin espacios ni guiones.`;

const birthDateError = (value: string, today: string = todayIso()): string | null => {
  if (value === "") return null;
  if (!ISO_DATE.test(value)) return "Escribe una fecha válida.";
  if (value < BIRTH_DATE_MIN) return "La fecha es demasiado antigua.";
  if (value > today) return "La fecha no puede ser futura.";
  return null;
};

const cityError = (value: string): string | null => {
  const city = value.trim();
  if (city.length > CITY_MAX_LENGTH) return `La ciudad no puede pasar de ${String(CITY_MAX_LENGTH)} caracteres.`;
  if (/[<>]/.test(city)) return "La ciudad contiene caracteres no permitidos.";
  return null;
};

const validateProfile = (values: ProfileFormValues, today?: string): ProfileFormErrors => {
  const errors: ProfileFormErrors = {};
  const first = nameError(values.firstName, "nombre");
  const last = nameError(values.lastName, "apellido");
  const phone = phoneError(values.phone);
  const birth = birthDateError(values.birthDate, today);
  const city = cityError(values.city);
  if (first) errors.firstName = first;
  if (last) errors.lastName = last;
  if (phone) errors.phone = phone;
  if (birth) errors.birthDate = birth;
  if (city) errors.city = city;
  return errors;
};

const profileToValues = (profile: Wire<AccountProfile>): ProfileFormValues => ({
  firstName: profile.firstName,
  lastName: profile.lastName,
  phone: profile.phone ?? "",
  birthDate: profile.birthDate ?? "",
  city: profile.city ?? "",
});

/** Names are trimmed; an emptied optional field becomes `null`, which tells the API to clear it. */
const valuesToRequest = (values: ProfileFormValues): UpdateProfileRequest => ({
  firstName: values.firstName.trim(),
  lastName: values.lastName.trim(),
  phone: values.phone === "" ? null : values.phone,
  birthDate: values.birthDate === "" ? null : values.birthDate,
  city: values.city.trim() === "" ? null : values.city.trim(),
});

export type { ProfileFormValues, ProfileFormErrors };
export { todayIso, sanitizePhone, phoneError, birthDateError, cityError, validateProfile, profileToValues, valuesToRequest };
