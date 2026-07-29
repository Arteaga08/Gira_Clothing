import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import {
  createVariantSchema,
  updateVariantSchema,
  variantListQuerySchema,
  stockUpdateSchema,
} from "../../../validators/variantValidator.js";
import {
  create,
  list,
  detail,
  update,
  deactivate,
  updateStock,
  stats,
} from "../../../controllers/variantController.js";

const variantRouter = Router();

variantRouter.get("/", validate(variantListQuerySchema, "query"), list);
variantRouter.post("/", validate(createVariantSchema), create);
// Mounted BEFORE /:id so "stats" is never swallowed by the param route.
variantRouter.get("/stats", stats);
variantRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
variantRouter.patch(
  "/:id",
  validate(objectIdParamSchema, "params"),
  validate(updateVariantSchema),
  update,
);
variantRouter.delete("/:id", validate(objectIdParamSchema, "params"), deactivate);
variantRouter.patch(
  "/:id/stock",
  validate(objectIdParamSchema, "params"),
  validate(stockUpdateSchema),
  updateStock,
);

export { variantRouter };
