import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import {
  updateShippingSchema,
  updateCurrencySchema,
  updateReservationSchema,
  updateInventorySchema,
  updateTaxSchema,
} from "../../../validators/settingsValidator.js";
import {
  detail,
  updateShipping,
  updateCurrency,
  updateReservation,
  updateInventory,
  updateTax,
} from "../../../controllers/settingsController.js";

const settingsRouter = Router();

settingsRouter.get("/", detail);
settingsRouter.patch("/shipping", validate(updateShippingSchema), updateShipping);
settingsRouter.patch("/currency", validate(updateCurrencySchema), updateCurrency);
settingsRouter.patch("/reservation", validate(updateReservationSchema), updateReservation);
settingsRouter.patch("/inventory", validate(updateInventorySchema), updateInventory);
settingsRouter.patch("/tax", validate(updateTaxSchema), updateTax);

export { settingsRouter };
