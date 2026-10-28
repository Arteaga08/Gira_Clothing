import { Router } from "express";
import { UserRole } from "@gira/shared";
import { protect, restrictTo } from "../../middlewares/protect.js";
import { validate } from "../../middlewares/validate.js";
import { accountWriteLimiter } from "../../middlewares/rateLimit.js";
import { updateProfileSchema } from "../../validators/accountValidator.js";
import { getAccount, updateProfile } from "../../controllers/accountController.js";

const accountRouter = Router();

// The customer's own data only: nothing here takes an owner id.
accountRouter.use(protect, restrictTo(UserRole.CUSTOMER));
accountRouter.get("/", getAccount);
accountRouter.patch("/profile", accountWriteLimiter, validate(updateProfileSchema), updateProfile);

export { accountRouter };
