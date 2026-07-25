import { Router } from "express";
import { UserRole } from "@gira/shared";
import { validate } from "../../middlewares/validate.js";
import { protect, restrictTo } from "../../middlewares/protect.js";
import { loginLimiter, registerLimiter } from "../../middlewares/rateLimit.js";
import {
  registerSchema,
  loginSchema,
  twoFactorCodeSchema,
} from "../../validators/authValidator.js";
import {
  register,
  login,
  me,
  logout,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable,
} from "../../controllers/authController.js";

const authRouter = Router();

authRouter.post("/register", registerLimiter, validate(registerSchema), register);
authRouter.post("/login", loginLimiter, validate(loginSchema), login);
authRouter.post("/logout", protect, logout);
authRouter.get("/me", protect, me);

// Admin-only 2FA management. Admin routes are not rate-limited (auth + role is
// the barrier). restrictTo always runs after protect.
authRouter.post("/2fa/setup", protect, restrictTo(UserRole.ADMIN), twoFactorSetup);
authRouter.post(
  "/2fa/enable",
  protect,
  restrictTo(UserRole.ADMIN),
  validate(twoFactorCodeSchema),
  twoFactorEnable,
);
authRouter.post(
  "/2fa/disable",
  protect,
  restrictTo(UserRole.ADMIN),
  validate(twoFactorCodeSchema),
  twoFactorDisable,
);

export { authRouter };
