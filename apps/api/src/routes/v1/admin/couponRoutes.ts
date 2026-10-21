import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import {
  createCouponSchema,
  updateCouponSchema,
  couponListQuerySchema,
} from "../../../validators/couponValidator.js";
import { create, list, detail, update, deactivate } from "../../../controllers/couponController.js";

const couponRouter = Router();

couponRouter.get("/", validate(couponListQuerySchema, "query"), list);
couponRouter.post("/", validate(createCouponSchema), create);
couponRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
couponRouter.patch(
  "/:id",
  validate(objectIdParamSchema, "params"),
  validate(updateCouponSchema),
  update,
);
couponRouter.delete("/:id", validate(objectIdParamSchema, "params"), deactivate);

export { couponRouter };
