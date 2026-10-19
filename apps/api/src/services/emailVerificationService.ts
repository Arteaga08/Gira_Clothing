import { AuditAction, AuditModule, UserRole } from "@gira/shared";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { hashOneTimeToken } from "../utils/oneTimeToken.js";
import { recordAudit } from "./auditService.js";
import { issueAccountToken, liveTokenFilter } from "./accountTokenService.js";
import { sendVerificationEmail } from "./authMailService.js";
import type { RequestContext } from "./authService.js";

/**
 * Account activation. The link alone is not enough: the person must also
 * type the password chosen at signup. Without it, someone could register a
 * stranger's address with their own password and wait for her to click the
 * link (pre-hijacking) — she does not know that password.
 */

const INVALID_LINK_MESSAGE = "El enlace no es válido o ya venció. Pide uno nuevo.";
const WRONG_PASSWORD_MESSAGE = "La contraseña no coincide con la de tu registro.";

const verifyEmail = async (token: string, password: string, ctx: RequestContext): Promise<void> => {
  const user = await User.findOne({
    ...liveTokenFilter("emailVerification", token),
    isActive: true,
  }).select("+password");
  if (!user) throw new AppError(INVALID_LINK_MESSAGE, 400);

  // A wrong password does not spend the token: a typo must not cost the link.
  if (!(await user.comparePassword(password))) {
    throw new AppError(WRONG_PASSWORD_MESSAGE, 401);
  }

  // Consume atomically: the filter carries the token hash, so of two
  // concurrent requests with the same link exactly one matches.
  const consumed = await User.updateOne(
    { _id: user._id, "emailVerification.tokenHash": hashOneTimeToken(token) },
    { $set: { emailVerified: true }, $unset: { emailVerification: "" } },
  );
  if (consumed.modifiedCount !== 1) throw new AppError(INVALID_LINK_MESSAGE, 400);

  await recordAudit({
    actorId: user._id,
    actorType: "user",
    action: AuditAction.EMAIL_VERIFIED,
    module: AuditModule.AUTH,
    ip: ctx.ip,
  });
};

/**
 * Always a silent no-op unless the account exists, is an active customer and
 * still pending — the controller answers the same either way. The cooldown
 * makes a burst of clicks send a single email.
 */
const resendVerification = async (email: string): Promise<void> => {
  const user = await User.findOne({
    email,
    role: UserRole.CUSTOMER,
    isActive: true,
    emailVerified: false,
  });
  if (!user) return;
  const token = await issueAccountToken(user._id, "emailVerification");
  if (token) void sendVerificationEmail({ to: user.email, token });
};

export { verifyEmail, resendVerification };
