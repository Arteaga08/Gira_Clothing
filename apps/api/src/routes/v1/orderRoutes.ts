import { Router } from "express";
import { UserRole } from "@gira/shared";
import { protect, restrictTo } from "../../middlewares/protect.js";
import { validate } from "../../middlewares/validate.js";
import {
  checkoutLimiter,
  checkoutPreviewLimiter,
  orderActionLimiter,
  orderLookupLimiter,
  trackingLimiter,
} from "../../middlewares/rateLimit.js";
import { objectIdParamSchema } from "../../validators/commonValidator.js";
import {
  createOrderSchema,
  checkoutPreviewSchema,
  publicIdParamSchema,
  myOrdersQuerySchema,
} from "../../validators/orderValidator.js";
import {
  create,
  preview,
  detailByPublicId,
  listMine,
  detailMine,
  payMine,
  cancelMine,
  tracking,
} from "../../controllers/orderController.js";

const orderRouter = Router();

const customerOnly = [protect, restrictTo(UserRole.CUSTOMER)];

// Checkout is accounts-only (M16). The strict per-customer limiter is the
// anti card-testing barrier (BACKEND_SECURITY_GUIDELINES).
orderRouter.post(
  "/preview",
  ...customerOnly,
  checkoutPreviewLimiter,
  validate(checkoutPreviewSchema),
  preview,
);
orderRouter.post("/", ...customerOnly, checkoutLimiter, validate(createOrderSchema), create);

// Authenticated customer panel. Mounted BEFORE /:publicId so "mine" is never
// swallowed by the param route.
orderRouter.get("/mine", protect, validate(myOrdersQuerySchema, "query"), listMine);
orderRouter.get("/mine/:id", protect, validate(objectIdParamSchema, "params"), detailMine);
orderRouter.post(
  "/mine/:id/payment",
  ...customerOnly,
  orderActionLimiter,
  validate(objectIdParamSchema, "params"),
  payMine,
);
orderRouter.post(
  "/mine/:id/cancel",
  ...customerOnly,
  orderActionLimiter,
  validate(objectIdParamSchema, "params"),
  cancelMine,
);

orderRouter.get(
  "/:publicId/tracking",
  trackingLimiter,
  validate(publicIdParamSchema, "params"),
  tracking,
);

orderRouter.get(
  "/:publicId",
  orderLookupLimiter,
  validate(publicIdParamSchema, "params"),
  detailByPublicId,
);

export { orderRouter };
