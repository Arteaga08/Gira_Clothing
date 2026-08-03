import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { statsRangeSchema, timeseriesQuerySchema } from "../../../validators/statsValidator.js";
import { topProductsQuerySchema } from "../../../validators/topProductsValidator.js";
import { overview, timeseries, topProducts } from "../../../controllers/statsController.js";

const statsRouter = Router();

statsRouter.get("/overview", validate(statsRangeSchema, "query"), overview);
statsRouter.get("/timeseries", validate(timeseriesQuerySchema, "query"), timeseries);
statsRouter.get("/top-products", validate(topProductsQuerySchema, "query"), topProducts);

export { statsRouter };
