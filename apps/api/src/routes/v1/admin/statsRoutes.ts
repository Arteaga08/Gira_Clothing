import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { statsRangeSchema, timeseriesQuerySchema } from "../../../validators/statsValidator.js";
import { overview, timeseries } from "../../../controllers/statsController.js";

const statsRouter = Router();

statsRouter.get("/overview", validate(statsRangeSchema, "query"), overview);
statsRouter.get("/timeseries", validate(timeseriesQuerySchema, "query"), timeseries);

export { statsRouter };
