import Joi from "joi";

/** Base every admin/public list query extends with its own explicit filters. */
const listQueryBase = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "La página debe ser un número.",
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    "number.max": "El máximo por página es 100.",
  }),
  sort: Joi.string().trim().max(40),
  search: Joi.string().trim().max(80).allow(""),
});

export { listQueryBase };
