import { Router } from "express";
import { UserRole } from "@gira/shared";
import { validate } from "../../middlewares/validate.js";
import { protect, restrictTo } from "../../middlewares/protect.js";
import { requireChallenge } from "../../middlewares/requireChallenge.js";
import {
  loginIpLimiter,
  loginLimiter,
  twoFactorLimiter,
  authActionLimiter,
  registerEmailLimiter,
  resendEmailLimiter,
  forgotEmailLimiter,
} from "../../middlewares/rateLimit.js";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  emailOnlySchema,
  resetPasswordSchema,
  twoFactorCodeSchema,
} from "../../validators/authValidator.js";
import {
  register,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  login,
  me,
  logout,
  logoutAll,
} from "../../controllers/authController.js";
import {
  verify,
  enrollStart,
  enrollComplete,
  setup,
} from "../../controllers/twoFactorController.js";

const authRouter = Router();

// Account actions: one shared per-IP bucket, plus a per-mailbox one where an
// email is the input.
authRouter.post(
  "/register",
  authActionLimiter,
  registerEmailLimiter,
  validate(registerSchema),
  register,
);
authRouter.post("/verify-email", authActionLimiter, validate(verifyEmailSchema), verifyEmail);
authRouter.post(
  "/resend-verification",
  authActionLimiter,
  resendEmailLimiter,
  validate(emailOnlySchema),
  resendVerificationEmail,
);
authRouter.post(
  "/forgot-password",
  authActionLimiter,
  forgotEmailLimiter,
  validate(emailOnlySchema),
  forgotPassword,
);
authRouter.post("/reset-password", authActionLimiter, validate(resetPasswordSchema), resetPassword);

authRouter.post("/login", loginIpLimiter, loginLimiter, validate(loginSchema), login);
authRouter.post("/logout", protect, logout);
authRouter.post("/logout-all", protect, logoutAll);
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
