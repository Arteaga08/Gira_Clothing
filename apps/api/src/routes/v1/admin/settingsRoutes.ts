import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import {
  updateShippingSchema,
  updateCurrencySchema,
  updateReservationSchema,
} from "../../../validators/settingsValidator.js";
import { detail, updateShipping, updateCurrency, updateReservation } from "../../../controllers/settingsController.js";

const settingsRouter = Router();

settingsRouter.get("/", detail);
settingsRouter.patch("/shipping", validate(updateShippingSchema), updateShipping);
settingsRouter.patch("/currency", validate(updateCurrencySchema), updateCurrency);
settingsRouter.patch("/reservation", validate(updateReservationSchema), updateReservation);

export { settingsRouter };
