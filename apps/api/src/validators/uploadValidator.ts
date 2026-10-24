import Joi from "joi";

/**
 * Multipart routes are NOT covered by the global mongoSanitize/sanitizeInput
 * chain (those only run on express.json bodies). An enum whitelist is enough
 * here — the only text field accepted is a closed set of logical folders.
 */
const uploadBodySchema = Joi.object({
  folder: Joi.string().valid("prints", "variants", "products", "home", "categories").required().messages({
    "any.only": 'El campo "folder" debe ser "prints", "variants", "products", "home" o "categories".',
    "any.required": 'El campo "folder" es obligatorio.',
  }),
});

export { uploadBodySchema };
