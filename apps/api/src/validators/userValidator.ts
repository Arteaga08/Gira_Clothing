import Joi from "joi";
import { UserRole } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const userListQuerySchema = listQueryBase.keys({
  role: Joi.string().valid(...Object.values(UserRole)),
  isActive: Joi.boolean(),
});

export { userListQuerySchema };
