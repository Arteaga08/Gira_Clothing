import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import {
  createProductSchema,
  updateProductSchema,
  productListQuerySchema,
} from "../../../validators/productValidator.js";
import { create, list, detail, update, deactivate } from "../../../controllers/productController.js";

const productRouter = Router();

productRouter.get("/", validate(productListQuerySchema, "query"), list);
productRouter.post("/", validate(createProductSchema), create);
productRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
productRouter.patch(
  "/:id",
  validate(objectIdParamSchema, "params"),
  validate(updateProductSchema),
  update,
);
productRouter.delete("/:id", validate(objectIdParamSchema, "params"), deactivate);

export { productRouter };
