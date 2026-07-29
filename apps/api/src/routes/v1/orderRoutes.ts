import { Router } from "express";
import { protect, optionalAuth } from "../../middlewares/protect.js";
import { validate } from "../../middlewares/validate.js";
import { checkoutLimiter, orderLookupLimiter } from "../../middlewares/rateLimit.js";
import { objectIdParamSchema } from "../../validators/commonValidator.js";
import {
  createOrderSchema,
  publicIdParamSchema,
  myOrdersQuerySchema,
} from "../../validators/orderValidator.js";
import { create, detailByPublicId, listMine, detailMine } from "../../controllers/orderController.js";

const orderRouter = Router();

// Checkout is open to guests; optionalAuth attaches the account when a valid
// session cookie is present. The strict limiter is the real barrier here —
// anti card-testing (BACKEND_SECURITY_GUIDELINES).
orderRouter.post("/", checkoutLimiter, optionalAuth, validate(createOrderSchema), create);

// Authenticated customer panel. Mounted BEFORE /:publicId so "mine" is never
// swallowed by the param route.
orderRouter.get("/mine", protect, validate(myOrdersQuerySchema, "query"), listMine);
orderRouter.get("/mine/:id", protect, validate(objectIdParamSchema, "params"), detailMine);

orderRouter.get(
  "/:publicId",
  orderLookupLimiter,
  validate(publicIdParamSchema, "params"),
  detailByPublicId,
);

export { orderRouter };
