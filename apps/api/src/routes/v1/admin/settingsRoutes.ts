import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import {
  updateShippingSchema,
  updateCurrencySchema,
  updateReservationSchema,
  updateInventorySchema,
  updateTaxSchema,
  updateAnnouncementSchema,
  updateHeroSchema,
} from "../../../validators/settingsValidator.js";
import {
  detail,
  updateShipping,
  updateCurrency,
  updateReservation,
  updateInventory,
  updateTax,
  updateAnnouncement,
  updateHero,
} from "../../../controllers/settingsController.js";

const settingsRouter = Router();

settingsRouter.get("/", detail);
settingsRouter.patch("/shipping", validate(updateShippingSchema), updateShipping);
settingsRouter.patch("/currency", validate(updateCurrencySchema), updateCurrency);
settingsRouter.patch("/reservation", validate(updateReservationSchema), updateReservation);
settingsRouter.patch("/inventory", validate(updateInventorySchema), updateInventory);
settingsRouter.patch("/tax", validate(updateTaxSchema), updateTax);
settingsRouter.patch("/announcement", validate(updateAnnouncementSchema), updateAnnouncement);
settingsRouter.patch("/hero", validate(updateHeroSchema), updateHero);

export { settingsRouter };
