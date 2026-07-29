import { Router } from "express";
import { UserRole } from "@gira/shared";
import { protect, restrictTo } from "../../../middlewares/protect.js";
import { printFamilyRouter } from "./printFamilyRoutes.js";
import { productCategoryRouter } from "./productCategoryRoutes.js";
import { uploadRouter } from "./uploadRoutes.js";
import { printRouter } from "./printRoutes.js";
import { productRouter } from "./productRoutes.js";
import { variantRouter } from "./variantRoutes.js";
import { settingsRouter } from "./settingsRoutes.js";
import { adminOrderRouter } from "./adminOrderRoutes.js";

/**
 * Admin router. protect + restrictTo are applied ONCE here, at mount level, so
 * anything mounted below is deny-by-default. With ~26 admin routes a per-route
 * guard (as in authRoutes.ts) would be a "forgot one line = IDOR" surface —
 * that's why this router differs from that pattern. Admin routes are not
 * rate-limited (auth + role is the barrier, same convention as M1).
 */
const adminRouter = Router();

adminRouter.use(protect, restrictTo(UserRole.ADMIN));

adminRouter.use("/print-families", printFamilyRouter);
adminRouter.use("/product-categories", productCategoryRouter);
adminRouter.use("/uploads", uploadRouter);
adminRouter.use("/prints", printRouter);
adminRouter.use("/products", productRouter);
adminRouter.use("/variants", variantRouter);
adminRouter.use("/settings", settingsRouter);
adminRouter.use("/orders", adminOrderRouter);

export { adminRouter };
