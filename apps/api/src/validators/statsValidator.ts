import Joi from "joi";
import { MAX_STATS_DAYS, STATS_GRANULARITIES } from "@gira/shared";

/** Shared by every stats endpoint — the window is the only query parameter. */
const statsRangeSchema = Joi.object({
  days: Joi.number().integer().min(1).max(MAX_STATS_DAYS).messages({
    "number.base": "El rango debe ser un número de días.",
    "number.max": `El rango máximo es de ${MAX_STATS_DAYS} días.`,
  }),
});

/**
 * Timeseries-only: `granularity` has no meaning for `/overview` or
 * `/admin/orders/stats`, which also consume `statsRangeSchema` — extending
 * the shared schema itself would let those endpoints silently accept a field
 * they never read.
 */
const timeseriesQuerySchema = statsRangeSchema.keys({
  granularity: Joi.string()
    .valid(...STATS_GRANULARITIES)
    .default("day")
    .messages({ "any.only": "La granularidad debe ser day, week, month o year." }),
});

export { statsRangeSchema, timeseriesQuerySchema };
