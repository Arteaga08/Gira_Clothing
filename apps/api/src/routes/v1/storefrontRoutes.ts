import { Router } from "express";
import { publicAnnouncement, publicHero, publicOfferBanner } from "../../controllers/settingsController.js";

/**
 * Public storefront reads that are not catalog data. Each endpoint exposes a
 * narrow projection, never a raw Settings section.
 */
const storefrontRouter = Router();

storefrontRouter.get("/announcement", publicAnnouncement);
storefrontRouter.get("/hero", publicHero);
storefrontRouter.get("/offer-banner", publicOfferBanner);

export { storefrontRouter };
