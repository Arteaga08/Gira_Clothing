import { Router } from "express";
import { protect } from "../../middlewares/protect.js";
import { validate } from "../../middlewares/validate.js";
import { wishlistLimiter } from "../../middlewares/rateLimit.js";
import { variantIdParamSchema } from "../../validators/commonValidator.js";
import { list, ids, save, unsave } from "../../controllers/wishlistController.js";

const wishlistRouter = Router();

// Saved items belong to an account; there is no guest wishlist.
wishlistRouter.use(protect, wishlistLimiter);

wishlistRouter.get("/", list);
wishlistRouter.get("/ids", ids);
wishlistRouter.put("/:variantId", validate(variantIdParamSchema, "params"), save);
wishlistRouter.delete("/:variantId", validate(variantIdParamSchema, "params"), unsave);

export { wishlistRouter };
