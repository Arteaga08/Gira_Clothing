import Joi from "joi";
import { OrderStatus } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const adminOrderListQuerySchema = listQueryBase.keys({
  status: Joi.string().valid(...Object.values(OrderStatus)),
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(OrderStatus))
    .required()
    .messages({ "any.only": "El estado no es válido." }),
});

export { adminOrderListQuerySchema, updateOrderStatusSchema };
