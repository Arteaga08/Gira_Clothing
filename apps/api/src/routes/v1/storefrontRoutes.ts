import { Router } from "express";
import { publicAnnouncement, publicHero } from "../../controllers/settingsController.js";

/**
 * Public storefront reads that are not catalog data. Each endpoint exposes a
 * narrow projection, never a raw Settings section.
 */
const storefrontRouter = Router();

storefrontRouter.get("/announcement", publicAnnouncement);
storefrontRouter.get("/hero", publicHero);

export { storefrontRouter };
