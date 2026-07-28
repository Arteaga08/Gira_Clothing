import Joi from "joi";
import { listQueryBase } from "./listQueryValidator.js";
import { objectId, imageObjectSchema } from "./commonValidator.js";

const sku = Joi.string()
  .trim()
  .uppercase()
  .min(2)
  .max(48)
  .pattern(/^[A-Z0-9-]+$/)
  .messages({ "string.pattern.base": "El SKU solo puede tener letras, números y guiones." });

const priceOverride = Joi.number().integer().min(0).max(10_000_000).messages({
  "number.integer": "El precio override debe ser un entero en centavos MXN.",
  "number.min": "El precio override no puede ser negativo.",
});

const images = Joi.array().items(imageObjectSchema).max(10).messages({
  "array.max": "No puedes registrar más de 10 imágenes.",
});

const createVariantSchema = Joi.object({
  product: objectId.required().messages({ "any.required": "El producto es obligatorio." }),
  print: objectId.required().messages({ "any.required": "El estampado es obligatorio." }),
  sku,
  images,
  priceOverride,
});

const updateVariantSchema = Joi.object({
  images,
  priceOverride,
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const variantListQuerySchema = listQueryBase.keys({
  product: objectId,
  print: objectId,
  isActive: Joi.boolean(),
});

// PATCH /:id/stock body — exactly one of onHand (absolute) or delta (relative).
const stockUpdateSchema = Joi.object({
  onHand: Joi.number().integer().min(0).max(1_000_000),
  delta: Joi.number().integer().invalid(0).min(-100_000).max(100_000),
})
  .xor("onHand", "delta")
  .messages({
    "object.xor": "Envía onHand (valor absoluto) o delta (ajuste relativo), no ambos.",
    "object.missing": "Envía onHand (valor absoluto) o delta (ajuste relativo).",
    "any.invalid": "El ajuste no puede ser 0.",
  });

export {
  createVariantSchema,
  updateVariantSchema,
  variantListQuerySchema,
  stockUpdateSchema,
};
