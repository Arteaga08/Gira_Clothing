import Joi from "joi";
import { PERIOD_PRESETS } from "../utils/resolveCurrentPeriod.js";

/**
 * `fecha` is forbidden outside `period=custom` on purpose — accepting it
 * silently for `today`/`week`/`month` would let a caller believe it does
 * something it doesn't.
 */
const topProductsQuerySchema = Joi.object({
  period: Joi.string()
    .valid(...PERIOD_PRESETS)
    .required()
    .messages({
      "any.only": "El periodo debe ser today, week, month o custom.",
      "any.required": "El periodo es obligatorio.",
    }),
  // convert:false — validate() now really replaces req.query with the Joi
  // output, and isoDate() would otherwise rewrite "2026-06-15" into a full
  // ISO timestamp that parseDayRange (expects YYYY-MM-DD) rejects.
  fecha: Joi.string()
    .isoDate()
    .options({ convert: false })
    .when("period", { is: "custom", then: Joi.required(), otherwise: Joi.forbidden() })
    .messages({
      "any.required": "La fecha es obligatoria cuando period=custom.",
      "any.unknown": "La fecha solo aplica cuando period=custom.",
      "string.isoDate": "La fecha debe tener formato YYYY-MM-DD.",
    }),
});

export { topProductsQuerySchema };
