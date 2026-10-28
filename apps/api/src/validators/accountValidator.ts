import Joi from "joi";
import {
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  CITY_MAX_LENGTH,
  BIRTH_DATE_MIN,
  ADDRESS_LABEL_MAX_LENGTH,
  LEGAL_NAME_MAX_LENGTH,
  RFC_PATTERN,
  FISCAL_REGIME_CODES,
  CFDI_USE_CODES,
} from "@gira/shared";
import { personName } from "./authValidator.js";
import { objectId } from "./commonValidator.js";
import { shippingAddressSchema, shippingPhone } from "./orderValidator.js";

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

/**
 * Saved addresses (M15c): the checkout's `shippingAddressSchema` extended, so
 * both places accept the same address. The sanitizer has already escaped < and >
 * by the time Joi runs, hence the `&lt;` / `&gt;` in the pattern.
 */
const NO_MARKUP = /[<>]|&lt;|&gt;/;
const noMarkup = (schema: Joi.StringSchema): Joi.StringSchema =>
  schema.pattern(NO_MARKUP, { invert: true, name: "html" }).messages({
    "string.pattern.invert.name": "Hay caracteres no permitidos.",
  });

const TEXT_FIELDS = ["recipient", "line1", "line2", "district", "city"];

const label = noMarkup(Joi.string().trim().max(ADDRESS_LABEL_MAX_LENGTH))
  .allow(null, "")
  .messages({ "string.max": `El nombre no puede pasar de ${String(ADDRESS_LABEL_MAX_LENGTH)} caracteres.` });

const addressBase = shippingAddressSchema
  .fork(TEXT_FIELDS, (field) => noMarkup(field as Joi.StringSchema))
  .fork(["line2"], (field) => field.allow(null));

const createAddressSchema = addressBase.keys({
  label,
  phone: shippingPhone,
  makeDefault: Joi.boolean().strict(),
});

// `country` is stripped: the country is always MX and never edited, so a PATCH carrying only it is "nothing to update".
const updateAddressSchema = addressBase
  .fork(["recipient", "line1", "district", "city", "state", "postalCode"], (field) => field.optional())
  .fork(["country"], () => Joi.any().strip())
  .keys({ label, phone: shippingPhone.optional() })
  .min(1)
  .messages({ "object.min": "No hay nada que actualizar." });

const addressParamSchema = Joi.object({ addressId: objectId.required() });

const saveBillingSchema = Joi.object({
  rfc: Joi.string().trim().uppercase().pattern(RFC_PATTERN).required().messages({
    "string.pattern.base": "El RFC debe tener 12 o 13 caracteres, por ejemplo LOMM910312AB1.",
    "any.required": "Falta el RFC.",
    "string.empty": "Falta el RFC.",
  }),
  legalName: noMarkup(Joi.string().trim().max(LEGAL_NAME_MAX_LENGTH)).required().messages({
    "any.required": "Falta la razón social.",
    "string.empty": "Falta la razón social.",
    "string.max": `La razón social no puede pasar de ${String(LEGAL_NAME_MAX_LENGTH)} caracteres.`,
  }),
  fiscalRegime: Joi.string()
    .valid(...FISCAL_REGIME_CODES)
    .required()
    .messages({ "any.only": "Elige un régimen fiscal válido.", "any.required": "Elige tu régimen fiscal." }),
  cfdiUse: Joi.string()
    .valid(...CFDI_USE_CODES)
    .required()
    .messages({ "any.only": "Elige un uso de CFDI válido.", "any.required": "Elige el uso de CFDI." }),
  postalCode: Joi.string().trim().pattern(POSTAL_CODE_PATTERN).required().messages({
    "string.pattern.base": "El código postal fiscal debe tener 5 dígitos.",
    "any.required": "Falta el código postal fiscal.",
  }),
});

export { updateProfileSchema, createAddressSchema, updateAddressSchema, addressParamSchema, saveBillingSchema };
