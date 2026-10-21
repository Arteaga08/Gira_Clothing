import Joi from "joi";
import {
  PRINT_NAME_MAX,
  PRINT_NAME_MIN,
  PRINT_SKU_MAX,
  PRINT_SKU_MIN,
  PRINT_SKU_PATTERN,
} from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";
import { objectId, imageObjectSchema } from "./commonValidator.js";

const name = Joi.string().trim().min(PRINT_NAME_MIN).max(PRINT_NAME_MAX).messages({
  "string.min": `El nombre debe tener al menos ${PRINT_NAME_MIN} caracteres.`,
  "string.max": `El nombre no puede exceder ${PRINT_NAME_MAX} caracteres.`,
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});

const sku = Joi.string()
  .trim()
  .uppercase()
  .min(PRINT_SKU_MIN)
  .max(PRINT_SKU_MAX)
  .pattern(PRINT_SKU_PATTERN)
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

// The SKU never changes: every variant SKU was built from it.
const updatePrintSchema = Joi.object({
  name,
  sku: Joi.any().forbidden().messages({ "any.unknown": "El SKU no se puede cambiar." }),
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
