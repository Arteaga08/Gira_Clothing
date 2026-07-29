import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { auditLogListQuerySchema } from "../../../validators/auditLogValidator.js";
import { list } from "../../../controllers/auditLogController.js";

const auditLogRouter = Router();

auditLogRouter.get("/", validate(auditLogListQuerySchema, "query"), list);

export { auditLogRouter };
