import { Router } from "express";
import { protect } from "../../middlewares/protect.js";
import { validate } from "../../middlewares/validate.js";
import { cartLimiter } from "../../middlewares/rateLimit.js";
import { variantIdParamSchema } from "../../validators/commonValidator.js";
import { setCartLineSchema } from "../../validators/cartValidator.js";
import { detail, setLine, removeLine, clear } from "../../controllers/cartController.js";

const cartRouter = Router();

// Guest carts live in the browser; everything here requires an account.
cartRouter.use(protect, cartLimiter);

cartRouter.get("/", detail);
cartRouter.put(
  "/lines/:variantId",
  validate(variantIdParamSchema, "params"),
  validate(setCartLineSchema),
  setLine,
);
cartRouter.delete("/lines/:variantId", validate(variantIdParamSchema, "params"), removeLine);
cartRouter.delete("/", clear);

export { cartRouter };
