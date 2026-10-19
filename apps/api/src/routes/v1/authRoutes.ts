import { Router } from "express";
import { UserRole } from "@gira/shared";
import { validate } from "../../middlewares/validate.js";
import { protect, restrictTo } from "../../middlewares/protect.js";
import { requireChallenge } from "../../middlewares/requireChallenge.js";
import {
  loginIpLimiter,
  loginLimiter,
  registerLimiter,
  twoFactorLimiter,
} from "../../middlewares/rateLimit.js";
import { registerSchema, loginSchema, twoFactorCodeSchema } from "../../validators/authValidator.js";
import { register, login, me, logout } from "../../controllers/authController.js";
import {
  verify,
  enrollStart,
  enrollComplete,
  setup,
} from "../../controllers/twoFactorController.js";

const authRouter = Router();

authRouter.post("/register", registerLimiter, validate(registerSchema), register);
authRouter.post("/login", loginIpLimiter, loginLimiter, validate(loginSchema), login);
authRouter.post("/logout", protect, logout);
authRouter.get("/me", protect, me);

// Second factor. Unlike the rest of the admin surface these routes are reachable
// BEFORE a session exists (the challenge cookie is the credential), so they carry
// their own failure limiter. restrictTo always runs after protect.
authRouter.use("/2fa", twoFactorLimiter);
authRouter.post("/2fa/verify", requireChallenge("verify"), validate(twoFactorCodeSchema), verify);
authRouter.post("/2fa/enroll/start", requireChallenge("enroll"), enrollStart);
authRouter.post(
  "/2fa/enroll/complete",
  requireChallenge("enroll"),
  validate(twoFactorCodeSchema),
  enrollComplete,
);
authRouter.post(
  "/2fa/setup",
  protect,
  restrictTo(UserRole.ADMIN),
  validate(twoFactorCodeSchema),
  setup,
);

export { authRouter };
