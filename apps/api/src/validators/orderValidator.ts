import Joi from "joi";
import {
  COUPON_CODE_MAX,
  COUPON_CODE_MIN,
  COUPON_CODE_PATTERN,
  Currency,
  MEXICAN_STATE_CODES,
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
} from "@gira/shared";
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
  district: Joi.string().trim().min(2).max(120).required().messages({
    "any.required": "Escribe tu colonia.",
    "string.empty": "Escribe tu colonia.",
  }),
  city: Joi.string().trim().min(2).max(120).required(),
  state: Joi.string()
    .valid(...MEXICAN_STATE_CODES)
    .required()
    .messages({ "any.only": "Elige un estado válido." }),
  postalCode: Joi.string().trim().pattern(POSTAL_CODE_PATTERN).required().messages({
    "string.pattern.base": "El código postal debe tener 5 dígitos.",
  }),
  // Mexico only for now: international needs customs data we do not collect.
  country: Joi.string().trim().uppercase().valid("MX").required().messages({
    "any.only": "Por ahora solo enviamos dentro de México.",
  }),
});

/** Digits only, ten of them: carriers reject anything else. Accepts "55 1234-5678". */
const phone = Joi.string()
  .trim()
  .custom((value: string, helpers) => {
    const digits = value.replace(/\D/g, "");
    return PHONE_PATTERN.test(digits) ? digits : helpers.error("string.pattern.base");
  })
  .required()
  .messages({
    "string.pattern.base": "El teléfono debe tener 10 dígitos.",
    "any.required": "El teléfono es obligatorio.",
    "string.empty": "El teléfono es obligatorio.",
  });

/**
 * NOTE: there is no `total`, `subtotal`, `unitPrice`, `shippingCost` or `discount` key
 * here, on purpose. A coupon travels as a CODE only; its amount is computed server-side. stripUnknown drops them if a client sends them; the
 * server is the only origin of an amount (pricingService). Shipping comes from
 * the stored quote the client points at with `shippingQuote`.
 */
const createOrderSchema = Joi.object({
  lines: Joi.array().items(orderLineSchema).min(1).max(30),
  useCart: Joi.boolean(),
  couponCode: Joi.string()
    .trim()
    .uppercase()
    .min(COUPON_CODE_MIN)
    .max(COUPON_CODE_MAX)
    .pattern(COUPON_CODE_PATTERN)
    .messages({
      "string.min": "El cupón no es válido.",
      "string.max": "El cupón no es válido.",
      "string.pattern.base": "El cupón no es válido.",
      "string.empty": "El cupón no es válido.",
    }),
  currency: Joi.string()
    .valid(...Object.values(Currency))
    .default(Currency.MXN),
  customer: Joi.object({
    email: Joi.string().trim().lowercase().email().max(160).required().messages({
      "string.email": "Escribe un correo electrónico válido.",
    }),
    name: Joi.string().trim().min(2).max(120).required(),
    phone,
  }).required(),
  shipping: shippingAddressSchema.required(),
  shippingQuote: Joi.object({
    quoteId: Joi.string().trim().min(10).max(80).required(),
    rateId: Joi.string().trim().min(10).max(40).required(),
  })
    .required()
    .messages({ "any.required": "Elige una opción de envío." }),
  termsAccepted: Joi.boolean().valid(true).required().messages({
    "any.only": "Debes aceptar los términos y condiciones.",
    "any.required": "Debes aceptar los términos y condiciones.",
  }),
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

export { createOrderSchema, publicIdParamSchema, myOrdersQuerySchema, shippingAddressSchema };
