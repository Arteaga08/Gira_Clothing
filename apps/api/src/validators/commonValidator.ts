import Joi from "joi";

/**
 * Reusable Joi fragments shared across catalog validators (BACKEND_SECURITY
 * §8: stripUnknown + explicit whitelisting, never trust client shape).
 */

const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "El identificador no tiene un formato válido.",
    "any.required": "El identificador es obligatorio.",
  });

const slugValue = Joi.string()
  .trim()
  .lowercase()
  .max(120)
  .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .messages({
    "string.pattern.base": "La URL amigable no tiene un formato válido.",
  });

const objectIdParamSchema = Joi.object({ id: objectId.required() });
const slugParamSchema = Joi.object({ slug: slugValue.required() });

const imageObjectSchema = Joi.object({
  url: Joi.string()
    .uri({ scheme: ["https"] })
    .required()
    .messages({
      "string.uri": "La imagen debe tener una URL https válida.",
      "any.required": "La imagen es obligatoria.",
    }),
  publicId: Joi.string().trim().max(200).required(),
  width: Joi.number().integer().min(1).required(),
  height: Joi.number().integer().min(1).required(),
});

export { objectId, slugValue, objectIdParamSchema, slugParamSchema, imageObjectSchema };
