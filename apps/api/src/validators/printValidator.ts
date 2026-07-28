import Joi from "joi";
import { listQueryBase } from "./listQueryValidator.js";
import { objectId, imageObjectSchema } from "./commonValidator.js";

const name = Joi.string().trim().min(2).max(80).messages({
  "string.min": "El nombre debe tener al menos 2 caracteres.",
  "string.max": "El nombre no puede exceder 80 caracteres.",
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});

const sku = Joi.string()
  .trim()
  .uppercase()
  .min(2)
  .max(24)
  .pattern(/^[A-Z0-9-]+$/)
  .messages({
    "string.pattern.base": "El SKU solo puede tener letras, números y guiones.",
    "any.required": "El SKU es obligatorio.",
    "string.empty": "El SKU es obligatorio.",
  });

const createPrintSchema = Joi.object({
  name: name.required(),
  sku: sku.required(),
  family: objectId.required().messages({ "any.required": "La familia es obligatoria." }),
  image: imageObjectSchema.required(),
});

const updatePrintSchema = Joi.object({
  name,
  sku,
  family: objectId,
  image: imageObjectSchema,
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const printListQuerySchema = listQueryBase.keys({
  family: objectId,
  isActive: Joi.boolean(),
});

export { createPrintSchema, updatePrintSchema, printListQuerySchema };
