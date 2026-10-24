import Joi from "joi";
import {
  PRINT_HOME_BLURB_MAX,
  PRINT_HOME_POSITION_MAX,
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

const homePosition = Joi.number().integer().min(1).max(PRINT_HOME_POSITION_MAX).messages({
  "number.base": "La posición en la home debe ser un número.",
  "number.integer": "La posición en la home debe ser un número entero.",
  "number.min": `La posición en la home va de 1 a ${PRINT_HOME_POSITION_MAX}.`,
  "number.max": `La posición en la home va de 1 a ${PRINT_HOME_POSITION_MAX}.`,
});

// Empty string clears it (the family description stands in).
const homeBlurb = Joi.string().trim().max(PRINT_HOME_BLURB_MAX).allow("").messages({
  "string.max": `El texto de la home no puede exceder ${PRINT_HOME_BLURB_MAX} caracteres.`,
});

const createPrintSchema = Joi.object({
  name: name.required(),
  sku: sku.required(),
  family: objectId.required().messages({ "any.required": "La familia es obligatoria." }),
  image: imageObjectSchema.required(),
  homePosition,
  homeBlurb,
});

// The SKU never changes: every variant SKU was built from it.
const updatePrintSchema = Joi.object({
  name,
  sku: Joi.any().forbidden().messages({ "any.unknown": "El SKU no se puede cambiar." }),
  family: objectId,
  image: imageObjectSchema,
  isActive: Joi.boolean(),
  // null takes the print out of the home.
  homePosition: homePosition.allow(null),
  homeBlurb,
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const printListQuerySchema = listQueryBase.keys({
  family: objectId,
  isActive: Joi.boolean(),
});

export { createPrintSchema, updatePrintSchema, printListQuerySchema };
