import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import { customerListQuerySchema, customerTopQuerySchema } from "../../../validators/customerValidator.js";
import { giveCouponSchema } from "../../../validators/couponValidator.js";
import { top, list, detail, giveCoupon } from "../../../controllers/customerController.js";

const customerRouter = Router();

// `/top` is declared before `/:id` so "top" is never read as an id.
customerRouter.get("/top", validate(customerTopQuerySchema, "query"), top);
customerRouter.get("/", validate(customerListQuerySchema, "query"), list);
customerRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
customerRouter.post(
  "/:id/coupons",
  validate(objectIdParamSchema, "params"),
  validate(giveCouponSchema),
  giveCoupon,
);

export { customerRouter };
