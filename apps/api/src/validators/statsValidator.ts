import Joi from "joi";

/** Shared by every stats endpoint — the window is the only query parameter. */
const statsRangeSchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).messages({
    "number.base": "El rango debe ser un número de días.",
    "number.max": "El rango máximo es de 365 días.",
  }),
});

export { statsRangeSchema };
