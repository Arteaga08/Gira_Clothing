import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { statsRangeSchema } from "../../../validators/statsValidator.js";
import { overview } from "../../../controllers/statsController.js";

const statsRouter = Router();

statsRouter.get("/overview", validate(statsRangeSchema, "query"), overview);

export { statsRouter };
