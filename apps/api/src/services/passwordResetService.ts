import { AuditAction, AuditModule } from "@gira/shared";
import { User, hashPassword } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./auditService.js";
import { issueAccountToken, liveTokenFilter } from "./accountTokenService.js";
import { sendPasswordResetEmail } from "./authMailService.js";
import { purgeSessions } from "./sessionService.js";
import type { RequestContext } from "./authService.js";

/**
 * "Forgot my password". The request never reveals whether the email has an
 * account; the reset link lives 1 h, works once, and completing it closes
 * every session of the account. It does not sign in: the person logs in
 * again with the new password.
 */

const INVALID_LINK_MESSAGE = "El enlace no es válido o ya venció. Pide uno nuevo.";

const requestPasswordReset = async (email: string, ctx: RequestContext): Promise<void> => {
  const user = await User.findOne({ email, isActive: true });
  if (!user) return;

  const token = await issueAccountToken(user._id, "passwordReset");
  if (!token) return; // still in the cooldown: the previous link is on its way

  void sendPasswordResetEmail({ to: user.email, token });
  await recordAudit({
    actorId: user._id,
    actorType: "user",
    action: AuditAction.PASSWORD_RESET_REQUESTED,
    module: AuditModule.AUTH,
    ip: ctx.ip,
  });
};

/**
 * One atomic update spends the token AND writes everything else: there is no
 * window where the link is gone but the password unchanged, or the password
 * changed but old sessions alive (tokenVersion bumps in the same write). The
 * hash is computed first, so it is paid whether or not the token exists.
 */
const resetPassword = async (token: string, password: string, ctx: RequestContext): Promise<void> => {
  const passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate(
    { ...liveTokenFilter("passwordReset", token), isActive: true },
    {
      // Opening the link proved control of the inbox, same as the activation link.
      $set: { password: passwordHash, emailVerified: true },
      $unset: { passwordReset: "", emailVerification: "" },
      $inc: { tokenVersion: 1 },
    },
    { new: true },
  );
  if (!user) throw new AppError(INVALID_LINK_MESSAGE, 400);

  await purgeSessions(user._id);
  await recordAudit({
    actorId: user._id,
    actorType: "user",
    action: AuditAction.PASSWORD_RESET_COMPLETED,
    module: AuditModule.AUTH,
    ip: ctx.ip,
  });
};

export { requestPasswordReset, resetPassword };
