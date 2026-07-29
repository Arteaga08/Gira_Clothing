import Joi from "joi";
import { AuditAction, AuditModule } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const auditLogListQuerySchema = listQueryBase.keys({
  module: Joi.string().valid(...Object.values(AuditModule)),
  action: Joi.string().valid(...Object.values(AuditAction)),
  actorId: Joi.string().hex().length(24).messages({
    "string.hex": "El identificador del actor no es válido.",
  }),
  days: Joi.number().integer().min(1).max(365),
});

export { auditLogListQuerySchema };
