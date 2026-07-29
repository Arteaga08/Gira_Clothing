import Joi from "joi";

/** qty: 0 removes the line; anything above 20 per line is rejected. */
const setCartLineSchema = Joi.object({
  qty: Joi.number().integer().min(0).max(20).required().messages({
    "number.min": "La cantidad no puede ser negativa.",
    "number.max": "La cantidad máxima por artículo es 20.",
    "any.required": "La cantidad es obligatoria.",
  }),
});

export { setCartLineSchema };
