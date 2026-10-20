import Joi from "joi";
import { Currency, MEXICAN_STATE_CODES, POSTAL_CODE_PATTERN } from "@gira/shared";
import { objectId } from "./commonValidator.js";

const quoteLineSchema = Joi.object({
  variantId: objectId.required(),
  qty: Joi.number().integer().min(1).max(20).required(),
});

const createQuoteSchema = Joi.object({
  lines: Joi.array().items(quoteLineSchema).min(1).max(30),
  useCart: Joi.boolean(),
  currency: Joi.string()
    .valid(...Object.values(Currency))
    .default(Currency.MXN),
  destination: Joi.object({
    postalCode: Joi.string().trim().pattern(POSTAL_CODE_PATTERN).required().messages({
      "string.pattern.base": "El código postal debe tener 5 dígitos.",
    }),
    state: Joi.string()
      .valid(...MEXICAN_STATE_CODES)
      .required()
      .messages({ "any.only": "Elige un estado válido." }),
    city: Joi.string().trim().min(2).max(120).required(),
  }).required(),
})
  .xor("lines", "useCart")
  .messages({ "object.xor": "Envía las líneas del carrito o usa useCart, no ambos." });

export { createQuoteSchema };
