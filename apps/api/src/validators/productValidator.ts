import Joi from "joi";
import {
  PRODUCT_NAME_MIN,
  PRODUCT_NAME_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_BASE_PRICE_MAX,
  PRODUCT_WEIGHT_MIN,
  PRODUCT_WEIGHT_MAX,
  PRODUCT_MEASURE_MAX,
  PRODUCT_MATERIALS_MAX,
  PRODUCT_MATERIAL_MAX,
} from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";
import { objectId, imageObjectSchema } from "./commonValidator.js";

const name = Joi.string().trim().min(PRODUCT_NAME_MIN).max(PRODUCT_NAME_MAX).messages({
  "string.min": "El nombre debe tener al menos 2 caracteres.",
  "string.max": "El nombre no puede exceder 120 caracteres.",
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});

const basePrice = Joi.number().integer().min(0).max(PRODUCT_BASE_PRICE_MAX).messages({
  "number.base": "El precio base debe ser un número.",
  "number.integer": "El precio base debe ser un entero en centavos MXN.",
  "number.min": "El precio base no puede ser negativo.",
  "any.required": "El precio base es obligatorio.",
});

const weightGrams = Joi.number().integer().min(PRODUCT_WEIGHT_MIN).max(PRODUCT_WEIGHT_MAX).messages({
  "number.base": "El peso debe ser un número en gramos.",
  "number.integer": "El peso debe ser un entero en gramos.",
  "number.min": "El peso mínimo es 1 g.",
  "number.max": "El peso máximo es 20,000 g.",
  "any.required": "El peso es obligatorio.",
});

const measurements = Joi.object({
  widthCm: Joi.number().min(0).max(PRODUCT_MEASURE_MAX),
  heightCm: Joi.number().min(0).max(PRODUCT_MEASURE_MAX),
  depthCm: Joi.number().min(0).max(PRODUCT_MEASURE_MAX),
}).messages({
  "number.max": "La medida no puede exceder 500 cm.",
});

const materials = Joi.array().items(Joi.string().trim().max(PRODUCT_MATERIAL_MAX)).max(PRODUCT_MATERIALS_MAX).messages({
  "array.max": "No puedes registrar más de 10 materiales.",
});

const createProductSchema = Joi.object({
  name: name.required(),
  category: objectId.required().messages({ "any.required": "La categoría es obligatoria." }),
  description: Joi.string().trim().max(PRODUCT_DESCRIPTION_MAX).allow(""),
  basePrice: basePrice.required(),
  weightGrams: weightGrams.required(),
  measurements,
  materials,
  sizeImage: imageObjectSchema,
});

const updateProductSchema = Joi.object({
  name,
  category: objectId,
  description: Joi.string().trim().max(PRODUCT_DESCRIPTION_MAX).allow(""),
  basePrice,
  weightGrams,
  measurements,
  materials,
  sizeImage: imageObjectSchema.allow(null),
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const productListQuerySchema = listQueryBase.keys({
  category: objectId,
  isActive: Joi.boolean(),
});

export { createProductSchema, updateProductSchema, productListQuerySchema };
