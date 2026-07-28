import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import {
  createProductCategorySchema,
  updateProductCategorySchema,
  productCategoryListQuerySchema,
} from "../../../validators/productCategoryValidator.js";
import {
  create,
  list,
  detail,
  update,
  deactivate,
} from "../../../controllers/productCategoryController.js";

const productCategoryRouter = Router();

productCategoryRouter.get("/", validate(productCategoryListQuerySchema, "query"), list);
productCategoryRouter.post("/", validate(createProductCategorySchema), create);
productCategoryRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
productCategoryRouter.patch(
  "/:id",
  validate(objectIdParamSchema, "params"),
  validate(updateProductCategorySchema),
  update,
);
productCategoryRouter.delete("/:id", validate(objectIdParamSchema, "params"), deactivate);

export { productCategoryRouter };
