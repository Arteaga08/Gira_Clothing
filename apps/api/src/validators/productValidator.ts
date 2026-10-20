import Joi from "joi";
import { listQueryBase } from "./listQueryValidator.js";
import { objectId } from "./commonValidator.js";

const name = Joi.string().trim().min(2).max(120).messages({
  "string.min": "El nombre debe tener al menos 2 caracteres.",
  "string.max": "El nombre no puede exceder 120 caracteres.",
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});

const basePrice = Joi.number().integer().min(0).max(10_000_000).messages({
  "number.base": "El precio base debe ser un número.",
  "number.integer": "El precio base debe ser un entero en centavos MXN.",
  "number.min": "El precio base no puede ser negativo.",
  "any.required": "El precio base es obligatorio.",
});

const weightGrams = Joi.number().integer().min(1).max(20_000).messages({
  "number.base": "El peso debe ser un número en gramos.",
  "number.integer": "El peso debe ser un entero en gramos.",
  "number.min": "El peso mínimo es 1 g.",
  "number.max": "El peso máximo es 20,000 g.",
  "any.required": "El peso es obligatorio.",
});

const measurements = Joi.object({
  widthCm: Joi.number().min(0).max(500),
  heightCm: Joi.number().min(0).max(500),
  depthCm: Joi.number().min(0).max(500),
}).messages({
  "number.max": "La medida no puede exceder 500 cm.",
});

const materials = Joi.array().items(Joi.string().trim().max(60)).max(10).messages({
  "array.max": "No puedes registrar más de 10 materiales.",
});

const createProductSchema = Joi.object({
  name: name.required(),
  category: objectId.required().messages({ "any.required": "La categoría es obligatoria." }),
  description: Joi.string().trim().max(2000).allow(""),
  basePrice: basePrice.required(),
  weightGrams: weightGrams.required(),
  measurements,
  materials,
});

const updateProductSchema = Joi.object({
  name,
  category: objectId,
  description: Joi.string().trim().max(2000).allow(""),
  basePrice,
  weightGrams,
  measurements,
  materials,
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const productListQuerySchema = listQueryBase.keys({
  category: objectId,
  isActive: Joi.boolean(),
});

export { createProductSchema, updateProductSchema, productListQuerySchema };
