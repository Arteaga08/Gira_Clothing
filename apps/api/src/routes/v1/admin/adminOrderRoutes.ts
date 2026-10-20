import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import { shippingAddressSchema } from "../../../validators/orderValidator.js";
import { statsRangeSchema } from "../../../validators/statsValidator.js";
import {
  adminOrderListQuerySchema,
  updateOrderStatusSchema,
  updatePrioritySchema,
  bulkStatusSchema,
} from "../../../validators/adminOrderValidator.js";
import {
  list,
  summary,
  detail,
  updateStatus,
  updatePriority,
  updateAddress,
  retryOrderLabel,
  shipOrder,
  orderTracking,
  bulkStatus,
  refund,
  activity,
  stats,
} from "../../../controllers/adminOrderController.js";

const adminOrderRouter = Router();

adminOrderRouter.get("/", validate(adminOrderListQuerySchema, "query"), list);
// Mounted BEFORE /:id so "stats" is never swallowed by the param route.
adminOrderRouter.get("/stats", validate(statsRangeSchema, "query"), stats);
// Mounted BEFORE /:id so "summary" is never swallowed by the param route.
adminOrderRouter.get("/summary", summary);
// Also before /:id: "bulk-status" must never be read as an order id.
adminOrderRouter.patch("/bulk-status", validate(bulkStatusSchema), bulkStatus);
adminOrderRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
adminOrderRouter.get("/:id/activity", validate(objectIdParamSchema, "params"), activity);
adminOrderRouter.patch(
  "/:id/status",
  validate(objectIdParamSchema, "params"),
  validate(updateOrderStatusSchema),
  updateStatus,
);
adminOrderRouter.patch(
  "/:id/priority",
  validate(objectIdParamSchema, "params"),
  validate(updatePrioritySchema),
  updatePriority,
);
adminOrderRouter.patch(
  "/:id/shipping-address",
  validate(objectIdParamSchema, "params"),
  validate(shippingAddressSchema.required()),
  updateAddress,
);
adminOrderRouter.post("/:id/label/retry", validate(objectIdParamSchema, "params"), retryOrderLabel);
adminOrderRouter.post("/:id/ship", validate(objectIdParamSchema, "params"), shipOrder);
adminOrderRouter.get("/:id/tracking", validate(objectIdParamSchema, "params"), orderTracking);
adminOrderRouter.post("/:id/refund", validate(objectIdParamSchema, "params"), refund);

export { adminOrderRouter };
