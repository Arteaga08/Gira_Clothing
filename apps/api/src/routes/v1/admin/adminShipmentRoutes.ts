import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import {
  createShipmentSchema,
  addShipmentEventSchema,
} from "../../../validators/shipmentValidator.js";
import { create, addEvent, detail } from "../../../controllers/shipmentController.js";

// mergeParams: the order id lives in the parent router's path (/orders/:id).
const adminShipmentRouter = Router({ mergeParams: true });

adminShipmentRouter.get("/", detail);
adminShipmentRouter.post("/", validate(createShipmentSchema), create);
adminShipmentRouter.patch("/", validate(addShipmentEventSchema), addEvent);

export { adminShipmentRouter };
