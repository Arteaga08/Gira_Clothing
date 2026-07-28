import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import {
  createPrintSchema,
  updatePrintSchema,
  printListQuerySchema,
} from "../../../validators/printValidator.js";
import { create, list, detail, update, deactivate } from "../../../controllers/printController.js";

const printRouter = Router();

printRouter.get("/", validate(printListQuerySchema, "query"), list);
printRouter.post("/", validate(createPrintSchema), create);
printRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
printRouter.patch(
  "/:id",
  validate(objectIdParamSchema, "params"),
  validate(updatePrintSchema),
  update,
);
printRouter.delete("/:id", validate(objectIdParamSchema, "params"), deactivate);

export { printRouter };
