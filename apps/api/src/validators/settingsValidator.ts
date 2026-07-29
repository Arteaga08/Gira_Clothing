import Joi from "joi";
import { Currency, PriceRounding } from "@gira/shared";

const money = Joi.number()
  .integer()
  .min(0)
  .max(100_000_000)
  .messages({
    "number.base": "El monto debe ser un número.",
    "number.integer": "Los montos se expresan en centavos, sin decimales.",
    "number.min": "El monto no puede ser negativo.",
  });

const updateShippingSchema = Joi.object({
  nationalFee: money,
  internationalFee: money,
  freeShippingThreshold: money.allow(null),
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

export { updateShippingSchema, updateCurrencySchema, updateReservationSchema };
