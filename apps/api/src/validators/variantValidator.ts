import Joi from "joi";
import {
  STOCK_DELTA_MAX,
  STOCK_ON_HAND_MAX,
  STOCK_REASON_MAX,
  VARIANT_IMAGES_MAX,
  VARIANT_PRICE_OVERRIDE_MAX,
} from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";
import { objectId, imageObjectSchema } from "./commonValidator.js";

const sku = Joi.string()
  .trim()
  .uppercase()
  .min(2)
  .max(48)
  .pattern(/^[A-Z0-9-]+$/)
  .messages({ "string.pattern.base": "El SKU solo puede tener letras, números y guiones." });

const priceOverride = Joi.number().integer().min(0).max(VARIANT_PRICE_OVERRIDE_MAX).messages({
  "number.integer": "El precio override debe ser un entero en centavos MXN.",
  "number.min": "El precio override no puede ser negativo.",
});

const images = Joi.array().items(imageObjectSchema).max(VARIANT_IMAGES_MAX).messages({
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
  priceOverride: priceOverride.allow(null),
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const variantListQuerySchema = listQueryBase.keys({
  product: objectId,
  print: objectId,
  category: objectId,
  isActive: Joi.boolean(),
  withImages: Joi.boolean(),
  stock: Joi.string().valid("out", "low", "ok").messages({
    "any.only": "El estado de stock debe ser out, low u ok.",
  }),
});

// PATCH /:id/stock body — exactly one of onHand (absolute) or delta (relative).
const stockUpdateSchema = Joi.object({
  onHand: Joi.number().integer().min(0).max(STOCK_ON_HAND_MAX),
  delta: Joi.number().integer().invalid(0).min(-STOCK_DELTA_MAX).max(STOCK_DELTA_MAX),
  reason: Joi.string().trim().max(STOCK_REASON_MAX).allow("").messages({
    "string.max": `El motivo no puede pasar de ${STOCK_REASON_MAX} caracteres.`,
  }),
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
