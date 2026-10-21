import Joi from "joi";
import { CUSTOMER_RANK_PERIODS, CUSTOMER_RANK_SORTS } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const customerTopQuerySchema = Joi.object({
  period: Joi.string()
    .valid(...CUSTOMER_RANK_PERIODS)
    .default("month")
    .messages({ "any.only": "El periodo debe ser today, week o month." }),
  sortBy: Joi.string()
    .valid(...CUSTOMER_RANK_SORTS)
    .default("spent")
    .messages({ "any.only": "El orden debe ser spent u orders." }),
});

const customerListQuerySchema = listQueryBase;

export { customerTopQuerySchema, customerListQuerySchema };
