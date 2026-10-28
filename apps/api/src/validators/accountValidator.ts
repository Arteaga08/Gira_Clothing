import Joi from "joi";
import { PHONE_PATTERN, CITY_MAX_LENGTH, BIRTH_DATE_MIN } from "@gira/shared";
import { personName } from "./authValidator.js";

/**
 * Profile edit (M15b). `email`, `role` and every other account field are
 * absent on purpose: `validate` runs with stripUnknown, so they never reach
 * the service. A field set to `null` clears the optional value.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today in Mexico City as YYYY-MM-DD: a birth date is a calendar day, and UTC is already "tomorrow" in the evening. */
const todayInMexico = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

const isRealDate = (value: string): boolean => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const birthDate = Joi.string()
  .pattern(ISO_DATE)
  .custom((value: string, helpers) => {
    if (!isRealDate(value)) return helpers.error("date.invalid");
    if (value < BIRTH_DATE_MIN) return helpers.error("date.tooOld");
    if (value > todayInMexico()) return helpers.error("date.future");
    return value;
  })
  .allow(null)
  .messages({
    "string.pattern.base": "La fecha debe tener el formato AAAA-MM-DD.",
    "date.invalid": "La fecha no es válida.",
    "date.tooOld": "La fecha es demasiado antigua.",
    "date.future": "La fecha no puede ser futura.",
  });

const updateProfileSchema = Joi.object({
  firstName: personName("El nombre").optional(),
  lastName: personName("El apellido").optional(),
  phone: Joi.string()
    .pattern(PHONE_PATTERN)
    .allow(null)
    .messages({ "string.pattern.base": "El celular debe tener 10 dígitos.", "string.empty": "El celular debe tener 10 dígitos." }),
  birthDate,
  city: Joi.string()
    .trim()
    .max(CITY_MAX_LENGTH)
    // The input sanitizer has already escaped < and > by the time Joi runs.
    .pattern(/[<>]|&lt;|&gt;/, { invert: true, name: "html" })
    .allow(null)
    .messages({
      "string.max": `La ciudad no puede pasar de ${String(CITY_MAX_LENGTH)} caracteres.`,
      "string.pattern.invert.name": "La ciudad contiene caracteres no permitidos.",
      "string.empty": "La ciudad no puede estar vacía.",
    }),
})
  .min(1)
  .messages({ "object.min": "No hay nada que actualizar." });

export { updateProfileSchema };
