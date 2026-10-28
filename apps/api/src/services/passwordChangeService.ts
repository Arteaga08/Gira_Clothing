import type { Types } from "mongoose";
import { AuditAction, AuditModule } from "@gira/shared";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./auditService.js";
import { revokeOtherSessions } from "./sessionService.js";
import { sendPasswordChangedEmail } from "./authMailService.js";
import type { RequestContext } from "./authService.js";

/**
 * Password change while signed in (M15b). The current password must match;
 * the new one is hashed by the model's pre-save hook. Every OTHER device is
 * signed out, the one in use stays (tokenVersion is deliberately not bumped).
 * Any "forgot my password" link issued earlier dies with the old password
 * (same save), and a notice email goes out without being awaited.
 * A wrong current password answers 400, not 401: on the storefront a 401
 * means "your session expired" and would send the person to the login page.
 */

const WRONG_CURRENT_MESSAGE = "La contraseña actual no es correcta.";

const changePassword = async (
  userId: Types.ObjectId,
  sessionId: string,
  currentPassword: string,
  newPassword: string,
  ctx: RequestContext,
): Promise<void> => {
  const user = await User.findOne({ _id: userId, isActive: true }).select("+password");
  if (!user) throw new AppError("No encontramos tu cuenta.", 404);
  if (!(await user.comparePassword(currentPassword))) throw new AppError(WRONG_CURRENT_MESSAGE, 400);

  user.password = newPassword;
  user.set("passwordReset", undefined);
  await user.save();
  await revokeOtherSessions(user._id, sessionId);
  await recordAudit({
    actorId: user._id,
    actorType: "user",
    action: AuditAction.PASSWORD_CHANGED,
    module: AuditModule.AUTH,
    ip: ctx.ip,
  });
  void sendPasswordChangedEmail({ to: user.email });
};

export { changePassword };
