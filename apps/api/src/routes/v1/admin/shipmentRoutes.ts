import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { shipmentListQuerySchema } from "../../../validators/shipmentValidator.js";
import { list } from "../../../controllers/shipmentController.js";

/**
 * Global shipments list — distinct from adminShipmentRoutes.ts, which is
 * mergeParams-nested under /admin/orders/:id/shipment. This one answers
 * "every parcel in transit", not "the parcel for this order".
 */
const shipmentRouter = Router();

shipmentRouter.get("/", validate(shipmentListQuerySchema, "query"), list);

export { shipmentRouter };
