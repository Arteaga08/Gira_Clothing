import { Router } from "express";
import { publicAnnouncement } from "../../controllers/settingsController.js";

/**
 * Public storefront reads that are not catalog data. Each endpoint exposes a
 * narrow projection, never a raw Settings section.
 */
const storefrontRouter = Router();

storefrontRouter.get("/announcement", publicAnnouncement);

export { storefrontRouter };
