import Joi from "joi";
import { PRINT_FAMILY_NAME_MAX, PRINT_FAMILY_NAME_MIN, PRINT_FAMILY_DESCRIPTION_MAX } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const name = Joi.string().trim().min(PRINT_FAMILY_NAME_MIN).max(PRINT_FAMILY_NAME_MAX).messages({
  "string.min": `El nombre debe tener al menos ${PRINT_FAMILY_NAME_MIN} caracteres.`,
  "string.max": `El nombre no puede exceder ${PRINT_FAMILY_NAME_MAX} caracteres.`,
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});

const description = Joi.string().trim().max(PRINT_FAMILY_DESCRIPTION_MAX).allow("");

const createPrintFamilySchema = Joi.object({
  name: name.required(),
  description,
});

const updatePrintFamilySchema = Joi.object({
  name,
  description,
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const printFamilyListQuerySchema = listQueryBase.keys({ isActive: Joi.boolean() });

export { createPrintFamilySchema, updatePrintFamilySchema, printFamilyListQuerySchema };
