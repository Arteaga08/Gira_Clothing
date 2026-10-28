import { Router } from "express";
import { protect } from "../../middlewares/protect.js";
import { validate } from "../../middlewares/validate.js";
import { cartLimiter, cartPreviewLimiter } from "../../middlewares/rateLimit.js";
import { variantIdParamSchema } from "../../validators/commonValidator.js";
import { setCartLineSchema, previewCartSchema } from "../../validators/cartValidator.js";
import { detail, setLine, removeLine, clear, preview } from "../../controllers/cartController.js";

const cartRouter = Router();

// Guest carts live in the browser: the preview is the only public route, and it
// is mounted before `protect` so it never sees the account gate.
cartRouter.post("/preview", cartPreviewLimiter, validate(previewCartSchema), preview);

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
