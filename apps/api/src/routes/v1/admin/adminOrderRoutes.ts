import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import { statsRangeSchema } from "../../../validators/statsValidator.js";
import {
  adminOrderListQuerySchema,
  updateOrderStatusSchema,
} from "../../../validators/adminOrderValidator.js";
import {
  list,
  detail,
  updateStatus,
  refund,
  stats,
} from "../../../controllers/adminOrderController.js";
import { adminShipmentRouter } from "./adminShipmentRoutes.js";

const adminOrderRouter = Router();

adminOrderRouter.get("/", validate(adminOrderListQuerySchema, "query"), list);
// Mounted BEFORE /:id so "stats" is never swallowed by the param route.
adminOrderRouter.get("/stats", validate(statsRangeSchema, "query"), stats);
adminOrderRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
adminOrderRouter.patch(
  "/:id/status",
  validate(objectIdParamSchema, "params"),
  validate(updateOrderStatusSchema),
  updateStatus,
);
adminOrderRouter.post("/:id/refund", validate(objectIdParamSchema, "params"), refund);

adminOrderRouter.use(
  "/:id/shipment",
  validate(objectIdParamSchema, "params"),
  adminShipmentRouter,
);

export { adminOrderRouter };
