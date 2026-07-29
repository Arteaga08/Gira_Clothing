import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import {
  adminOrderListQuerySchema,
  updateOrderStatusSchema,
} from "../../../validators/adminOrderValidator.js";
import { list, detail, updateStatus, refund } from "../../../controllers/adminOrderController.js";

const adminOrderRouter = Router();

adminOrderRouter.get("/", validate(adminOrderListQuerySchema, "query"), list);
adminOrderRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
adminOrderRouter.patch(
  "/:id/status",
  validate(objectIdParamSchema, "params"),
  validate(updateOrderStatusSchema),
  updateStatus,
);
adminOrderRouter.post("/:id/refund", validate(objectIdParamSchema, "params"), refund);

export { adminOrderRouter };
