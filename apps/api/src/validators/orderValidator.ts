import Joi from "joi";
import { Currency } from "@gira/shared";
import { objectId } from "./commonValidator.js";
import { listQueryBase } from "./listQueryValidator.js";

const orderLineSchema = Joi.object({
  variantId: objectId.required(),
  qty: Joi.number().integer().min(1).max(20).required().messages({
    "number.min": "La cantidad debe ser al menos 1.",
    "number.max": "La cantidad máxima por artículo es 20.",
  }),
});

const shippingAddressSchema = Joi.object({
  recipient: Joi.string().trim().min(2).max(120).required(),
  line1: Joi.string().trim().min(3).max(200).required(),
  line2: Joi.string().trim().max(200).allow(""),
  city: Joi.string().trim().min(2).max(120).required(),
  state: Joi.string().trim().min(2).max(120).required(),
  postalCode: Joi.string().trim().max(20).required(),
  country: Joi.string().trim().uppercase().length(2).required().messages({
    "string.length": "Usa el código de país de 2 letras (por ejemplo, MX).",
  }),
});

/**
 * NOTE: there is no `total`, `subtotal`, `unitPrice` or `shippingCost` key
 * here, on purpose. stripUnknown drops them if a client sends them; the
 * server is the only origin of an amount (pricingService).
 */
const createOrderSchema = Joi.object({
  lines: Joi.array().items(orderLineSchema).min(1).max(30),
  useCart: Joi.boolean(),
  currency: Joi.string()
    .valid(...Object.values(Currency))
    .default(Currency.MXN),
  customer: Joi.object({
    email: Joi.string().trim().lowercase().email().max(160).required().messages({
      "string.email": "Escribe un correo electrónico válido.",
    }),
    name: Joi.string().trim().min(2).max(120).required(),
    phone: Joi.string().trim().max(30).allow(""),
  }).required(),
  shipping: shippingAddressSchema.required(),
})
  .xor("lines", "useCart")
  .messages({ "object.xor": "Envía las líneas del carrito o usa useCart, no ambos." });

const publicIdParamSchema = Joi.object({
  publicId: Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9_-]{43,64}$/)
    .required()
    .messages({ "string.pattern.base": "El identificador de la orden no es válido." }),
});

const myOrdersQuerySchema = listQueryBase;

export { createOrderSchema, publicIdParamSchema, myOrdersQuerySchema };
