import Joi from "joi";
import { AUDIT_ACTOR_FILTERS, AuditAction, AuditModule } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const auditLogListQuerySchema = listQueryBase.keys({
  module: Joi.string().valid(...Object.values(AuditModule)),
  action: Joi.string().valid(...Object.values(AuditAction)),
  actorId: Joi.string().hex().length(24).messages({
    "string.hex": "El identificador del actor no es válido.",
  }),
  actor: Joi.string()
    .valid(...AUDIT_ACTOR_FILTERS)
    .messages({ "any.only": "El filtro de actor no es válido." }),
  days: Joi.number().integer().min(1).max(365),
});

export { auditLogListQuerySchema };
