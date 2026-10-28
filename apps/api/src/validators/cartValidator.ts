import Joi from "joi";
import { CART_MAX_LINES } from "@gira/shared";
import { objectId } from "./commonValidator.js";

/** qty: 0 removes the line; anything above 20 per line is rejected. */
const setCartLineSchema = Joi.object({
  qty: Joi.number().integer().min(0).max(20).required().messages({
    "number.min": "La cantidad no puede ser negativa.",
    "number.max": "La cantidad máxima por artículo es 20.",
    "any.required": "La cantidad es obligatoria.",
  }),
});

/** Guest cart read: what the browser holds, at most one line per variant. */
const previewCartSchema = Joi.object({
  lines: Joi.array()
    .items(
      Joi.object({
        variantId: objectId.required(),
        qty: Joi.number().integer().min(1).max(20).required(),
      }),
    )
    .min(1)
    .max(CART_MAX_LINES)
    .unique("variantId")
    .required()
    .messages({
      "array.min": "El carrito está vacío.",
      "array.max": "Tu carrito tiene demasiados artículos distintos.",
      "array.unique": "No repitas el mismo artículo: usa la cantidad.",
    }),
});

export { setCartLineSchema, previewCartSchema };
