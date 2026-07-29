import { Router } from "express";
import { validate } from "../../middlewares/validate.js";
import { catalogLimiter } from "../../middlewares/rateLimit.js";
import { slugParamSchema } from "../../validators/commonValidator.js";
import {
  publicListQuerySchema,
  publicPrintQuerySchema,
  publicProductQuerySchema,
} from "../../validators/catalogValidator.js";
import {
  listFamilies,
  familyDetail,
  listPrints,
  printDetail,
  listCategories,
  listProducts,
  productDetail,
} from "../../controllers/catalogController.js";

/**
 * Public catalog router — no auth, read-only, isActive:true only.
 */
const catalogRouter = Router();

catalogRouter.use(catalogLimiter);

catalogRouter.get("/families", validate(publicListQuerySchema, "query"), listFamilies);
catalogRouter.get("/families/:slug", validate(slugParamSchema, "params"), familyDetail);
catalogRouter.get("/prints", validate(publicPrintQuerySchema, "query"), listPrints);
catalogRouter.get("/prints/:slug", validate(slugParamSchema, "params"), printDetail);
catalogRouter.get("/categories", validate(publicListQuerySchema, "query"), listCategories);
catalogRouter.get("/products", validate(publicProductQuerySchema, "query"), listProducts);
catalogRouter.get("/products/:slug", validate(slugParamSchema, "params"), productDetail);

export { catalogRouter };
