import Joi from "joi";
import {
  Currency,
  MEXICAN_STATE_CODES,
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  PriceRounding,
} from "@gira/shared";

const money = Joi.number()
  .integer()
  .min(0)
  .max(100_000_000)
  .messages({
    "number.base": "El monto debe ser un número.",
    "number.integer": "Los montos se expresan en centavos, sin decimales.",
    "number.min": "El monto no puede ser negativo.",
  });

const originSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().pattern(PHONE_PATTERN).required().messages({
    "string.pattern.base": "El teléfono debe tener 10 dígitos.",
  }),
  email: Joi.string().trim().lowercase().email().max(160).allow(""),
  line1: Joi.string().trim().min(3).max(200).required(),
  district: Joi.string().trim().min(2).max(120).required(),
  city: Joi.string().trim().min(2).max(120).required(),
  state: Joi.string()
    .valid(...MEXICAN_STATE_CODES)
    .required()
    .messages({ "any.only": "Elige un estado válido." }),
  postalCode: Joi.string().trim().pattern(POSTAL_CODE_PATTERN).required().messages({
    "string.pattern.base": "El código postal debe tener 5 dígitos.",
  }),
});

const parcelSettingsSchema = Joi.object({
  tareGrams: Joi.number().integer().min(0).max(5_000),
  boxLengthCm: Joi.number().integer().min(1).max(200),
  boxWidthCm: Joi.number().integer().min(1).max(200),
  boxHeightCm: Joi.number().integer().min(1).max(200),
  extraUnitHeightCm: Joi.number().integer().min(0).max(100),
  maxWeightGrams: Joi.number().integer().min(1).max(70_000),
}).min(1);

const updateShippingSchema = Joi.object({
  origin: originSchema,
  freeShippingThreshold: money.allow(null),
  parcel: parcelSettingsSchema,
  quoteTtlMinutes: Joi.number().integer().min(5).max(240),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const updateCurrencySchema = Joi.object({
  mxnPerUsdCents: Joi.number().integer().min(1).max(1_000_000).messages({
    "number.min": "El tipo de cambio debe ser mayor a cero.",
  }),
  rounding: Joi.string()
    .valid(...Object.values(PriceRounding))
    .messages({ "any.only": "El modo de redondeo no es válido." }),
  supported: Joi.array()
    .items(Joi.string().valid(...Object.values(Currency)))
    .min(1),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const updateReservationSchema = Joi.object({
  ttlMinutes: Joi.number().integer().min(1).max(1440).messages({
    "number.max": "La reserva no puede durar más de 24 horas.",
  }),
  cartInactivityDays: Joi.number().integer().min(1).max(365),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const updateInventorySchema = Joi.object({
  lowStockThreshold: Joi.number().integer().min(0).max(1000).messages({
    "number.integer": "El umbral debe ser un número entero de unidades.",
    "number.max": "El umbral no puede superar 1000 unidades.",
  }),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

export {
  updateShippingSchema,
  updateCurrencySchema,
  updateReservationSchema,
  updateInventorySchema,
};
