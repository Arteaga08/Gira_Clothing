import Joi from "joi";
import { CATEGORY_COLORS, PRODUCT_CATEGORY_NAME_MAX, PRODUCT_CATEGORY_NAME_MIN, PRODUCT_CATEGORY_DESCRIPTION_MAX } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const name = Joi.string().trim().min(PRODUCT_CATEGORY_NAME_MIN).max(PRODUCT_CATEGORY_NAME_MAX).messages({
  "string.min": `El nombre debe tener al menos ${PRODUCT_CATEGORY_NAME_MIN} caracteres.`,
  "string.max": `El nombre no puede exceder ${PRODUCT_CATEGORY_NAME_MAX} caracteres.`,
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});

const description = Joi.string().trim().max(PRODUCT_CATEGORY_DESCRIPTION_MAX).allow("");

const color = Joi.string().valid(...CATEGORY_COLORS).messages({ "any.only": "Elige un color de la lista." });

const createProductCategorySchema = Joi.object({
  name: name.required(),
  description,
  color,
});

const updateProductCategorySchema = Joi.object({
  name,
  description,
  color,
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const productCategoryListQuerySchema = listQueryBase.keys({ isActive: Joi.boolean() });

export { createProductCategorySchema, updateProductCategorySchema, productCategoryListQuerySchema };
