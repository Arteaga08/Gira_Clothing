import { Router } from "express";
import { UserRole } from "@gira/shared";
import { protect, restrictTo } from "../../middlewares/protect.js";
import { validate } from "../../middlewares/validate.js";
import { accountWriteLimiter } from "../../middlewares/rateLimit.js";
import {
  addressParamSchema,
  createAddressSchema,
  saveBillingSchema,
  updateAddressSchema,
  updateProfileSchema,
} from "../../validators/accountValidator.js";
import {
  addAddress,
  editAddress,
  getAccount,
  makeAddressDefault,
  putBilling,
  removeAddress,
  removeBilling,
  updateProfile,
} from "../../controllers/accountController.js";

const accountRouter = Router();

// The customer's own data only: nothing here takes an owner id.
accountRouter.use(protect, restrictTo(UserRole.CUSTOMER));
accountRouter.get("/", getAccount);
accountRouter.patch("/profile", accountWriteLimiter, validate(updateProfileSchema), updateProfile);

accountRouter.post("/addresses", accountWriteLimiter, validate(createAddressSchema), addAddress);
accountRouter.patch(
  "/addresses/:addressId",
  accountWriteLimiter,
  validate(addressParamSchema, "params"),
  validate(updateAddressSchema),
  editAddress,
);
accountRouter.post(
  "/addresses/:addressId/default",
  accountWriteLimiter,
  validate(addressParamSchema, "params"),
  makeAddressDefault,
);
accountRouter.delete("/addresses/:addressId", accountWriteLimiter, validate(addressParamSchema, "params"), removeAddress);

accountRouter.put("/billing", accountWriteLimiter, validate(saveBillingSchema), putBilling);
accountRouter.delete("/billing", accountWriteLimiter, removeBilling);

export { accountRouter };
