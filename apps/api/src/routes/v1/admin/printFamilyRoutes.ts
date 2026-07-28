import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { objectIdParamSchema } from "../../../validators/commonValidator.js";
import {
  createPrintFamilySchema,
  updatePrintFamilySchema,
  printFamilyListQuerySchema,
} from "../../../validators/printFamilyValidator.js";
import { create, list, detail, update, deactivate } from "../../../controllers/printFamilyController.js";

const printFamilyRouter = Router();

printFamilyRouter.get("/", validate(printFamilyListQuerySchema, "query"), list);
printFamilyRouter.post("/", validate(createPrintFamilySchema), create);
printFamilyRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
printFamilyRouter.patch(
  "/:id",
  validate(objectIdParamSchema, "params"),
  validate(updatePrintFamilySchema),
  update,
);
printFamilyRouter.delete("/:id", validate(objectIdParamSchema, "params"), deactivate);

export { printFamilyRouter };
