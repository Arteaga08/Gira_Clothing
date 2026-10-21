import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { auditLogListQuerySchema } from "../../../validators/auditLogValidator.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import { list, detail } from "../../../controllers/auditLogController.js";

const auditLogRouter = Router();

auditLogRouter.get("/", validate(auditLogListQuerySchema, "query"), list);
auditLogRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);

export { auditLogRouter };
