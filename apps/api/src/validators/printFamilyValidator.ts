import Joi from "joi";
import { listQueryBase } from "./listQueryValidator.js";

const name = Joi.string().trim().min(2).max(80).messages({
  "string.min": "El nombre debe tener al menos 2 caracteres.",
  "string.max": "El nombre no puede exceder 80 caracteres.",
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});

const description = Joi.string().trim().max(500).allow("");

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
