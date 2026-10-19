import { authenticator } from "otplib";
import QRCode from "qrcode";
import type { Types } from "mongoose";
import { AuditAction, AuditModule, TWO_FACTOR_INVALID_MESSAGE, UserRole } from "@gira/shared";
import { User, type UserDocument } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { encryptSecret, decryptSecret } from "../utils/crypto.js";
import { recordAudit } from "./auditService.js";
import { purgeSessions, revokeAllSessions } from "./sessionService.js";

/**
 * Second factor (TOTP) for admin accounts (BACKEND_SECURITY_GUIDELINES §2).
 * Every code check goes through `verifyCode`, which adds what a bare
 * `authenticator.verify` lacks: a code is accepted once (anti-replay), and
 * repeated failures lock the account for a while.
 */

interface RequestContext {
  ip?: string | undefined;
}

const APP_ISSUER = "Gira Clothing";
const STEP_SECONDS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

// ±1 step of tolerance for clock drift between the server and the phone.
const totp = authenticator.clone({ window: 1, step: STEP_SECONDS });

const LOCKED_MESSAGE = "Demasiados códigos incorrectos. Intenta de nuevo en 15 minutos.";

const currentStep = (): number => Math.floor(Date.now() / 1000 / STEP_SECONDS);

const audit = (
  action: AuditAction,
  actorId: Types.ObjectId | undefined,
  ctx: RequestContext,
): Promise<void> =>
  recordAudit({
    actorId,
    actorType: "user",
    action,
    module: AuditModule.AUTH,
    ip: ctx.ip,
  });

/** Filter for "no active lock". A function, not a constant: `now` must be read per call. */
const notLocked = () => ({
  $or: [{ "twoFactor.lockedUntil": null }, { "twoFactor.lockedUntil": { $lte: new Date() } }],
});

/** Locks the account; the filter makes concurrent callers lock (and audit) only once. */
const lockAccount = async (user: UserDocument, ctx: RequestContext): Promise<void> => {
  const locked = await User.updateOne(
    { _id: user._id, ...notLocked() },
    { $set: { "twoFactor.lockedUntil": new Date(Date.now() + LOCK_MS), "twoFactor.failedAttempts": 0 } },
  );
  if (locked.modifiedCount === 1) {
    await audit(AuditAction.TWO_FACTOR_LOCKED, user._id, ctx);
  }
};

/**
 * Checks a code against the user's stored secret. Throws 429 while locked,
 * 400 for a wrong, reused or missing-secret code. Resolves on success after
 * recording the consumed time step.
 *
 * The attempt is RESERVED first, atomically (`$inc` on an unlocked account),
 * and only then is the code checked. Checking first and counting afterwards
 * would let N parallel requests all read "not locked" and test N guesses; with
 * the reservation, at most MAX_FAILED_ATTEMPTS requests ever reach the check.
 */
const verifyCode = async (userId: string, code: string, ctx: RequestContext): Promise<void> => {
  const user = await User.findOneAndUpdate(
    { _id: userId, ...notLocked() },
    { $inc: { "twoFactor.failedAttempts": 1 } },
    { new: true },
  ).select("+twoFactor.secret");

  if (!user) {
    // Either the account does not exist or it is locked right now.
    if (!(await User.exists({ _id: userId }))) {
      throw new AppError("Tu verificación expiró. Inicia sesión de nuevo.", 401);
    }
    throw new AppError(LOCKED_MESSAGE, 429);
  }

  const attempt = user.twoFactor.failedAttempts;
  if (attempt > MAX_FAILED_ATTEMPTS) {
    // Reserved past the limit before the lock landed: refuse without checking, and make sure it lands.
    await lockAccount(user, ctx);
    throw new AppError(LOCKED_MESSAGE, 429);
  }

  const { secret } = user.twoFactor;
  const delta = secret ? totp.checkDelta(code, decryptSecret(secret)) : null;
  if (delta !== null) {
    const step = currentStep() + delta;
    // One atomic write both claims the step and clears the failure state: two
    // concurrent requests with the same code cannot both match the filter.
    const claimed = await User.updateOne(
      {
        _id: user._id,
        $and: [
          notLocked(),
          { $or: [{ "twoFactor.lastUsedStep": null }, { "twoFactor.lastUsedStep": { $lt: step } }] },
        ],
      },
      {
        $set: { "twoFactor.lastUsedStep": step, "twoFactor.failedAttempts": 0 },
        $unset: { "twoFactor.lockedUntil": "" },
      },
    );
    if (claimed.modifiedCount === 1) return;
  }

  await audit(AuditAction.TWO_FACTOR_FAILED, user._id, ctx);
  if (attempt >= MAX_FAILED_ATTEMPTS) {
    await lockAccount(user, ctx);
  }
  throw new AppError(TWO_FACTOR_INVALID_MESSAGE, 400);
};

/**
 * Returns the pending secret and its QR, creating the secret only if none
 * exists. Idempotent on purpose: a second call (a remount, a double click, a
 * parallel tab) must not rotate the key under an authenticator app that
 * already scanned the first QR.
 */
const startEnrollment = async (
  userId: string,
  ctx: RequestContext,
): Promise<{ qrDataUrl: string; manualKey: string }> => {
  const candidate = authenticator.generateSecret();
  // Atomic "set if absent": concurrent calls race on this one write and only one wins.
  const created = await User.updateOne(
    { _id: userId, "twoFactor.enabled": false, "twoFactor.secret": { $exists: false } },
    { $set: { "twoFactor.secret": encryptSecret(candidate) }, $unset: { "twoFactor.lastUsedStep": "" } },
  );

  const user = await User.findById(userId).select("+twoFactor.secret");
  if (!user) {
    throw new AppError("Tu verificación expiró. Inicia sesión de nuevo.", 401);
  }
  if (user.twoFactor.enabled || !user.twoFactor.secret) {
    throw new AppError("La verificación en dos pasos ya está activa.", 409);
  }
  if (created.modifiedCount === 1) {
    await audit(AuditAction.TWO_FACTOR_SETUP, user._id, ctx);
  }

  const manualKey = decryptSecret(user.twoFactor.secret);
  const otpauthUrl = authenticator.keyuri(user.email, APP_ISSUER, manualKey);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "M", margin: 2, width: 240 });
  return { qrDataUrl, manualKey };
};

/** Confirms the pending secret with a code, turns the factor on and revokes older sessions. */
const completeEnrollment = async (
  userId: string,
  code: string,
  ctx: RequestContext,
): Promise<UserDocument> => {
  const pending = await User.findById(userId).select("+twoFactor.secret");
  if (!pending || pending.twoFactor.enabled || !pending.twoFactor.secret) {
    throw new AppError("Primero debes iniciar la configuración de dos factores.", 400);
  }

  await verifyCode(userId, code, ctx);

  // Sessions issued before the factor existed no longer reflect the account:
  // bump the version so only the session minted right after this call lives.
  const enabled = await User.findOneAndUpdate(
    { _id: pending._id, "twoFactor.enabled": false },
    { $set: { "twoFactor.enabled": true }, $inc: { tokenVersion: 1 } },
    { new: true },
  );
  if (!enabled) {
    throw new AppError("La verificación en dos pasos ya está activa.", 409);
  }
  await purgeSessions(enabled._id);
  await audit(AuditAction.TWO_FACTOR_ENABLED, enabled._id, ctx);
  return enabled;
};

/** Turns the factor off and kills every session; the next login must enrol again. */
const clearTwoFactor = async (userId: Types.ObjectId | string): Promise<void> => {
  await User.updateOne(
    { _id: userId },
    {
      $set: { "twoFactor.enabled": false, "twoFactor.failedAttempts": 0 },
      $unset: {
        "twoFactor.secret": "",
        "twoFactor.lastUsedStep": "",
        "twoFactor.lockedUntil": "",
      },
    },
  );
  await revokeAllSessions(userId);
};

/**
 * Admin-initiated reset from inside a session. It needs the current code for
 * the same reason enrolling does: a stolen session must not be able to strip
 * the second factor without proving it holds the device.
 */
const resetTwoFactor = async (userId: string, code: string, ctx: RequestContext): Promise<void> => {
  const user = await User.findById(userId);
  if (!user || !user.twoFactor.enabled) {
    throw new AppError("El segundo factor no está activo.", 400);
  }
  await verifyCode(userId, code, ctx);
  await clearTwoFactor(user._id);
  await audit(AuditAction.TWO_FACTOR_RESET, user._id, ctx);
};

/** Recovery path for the `2fa:reset-admin` script: no code, system actor. */
const resetAdminTwoFactorByEmail = async (email: string): Promise<void> => {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || user.role !== UserRole.ADMIN) {
    throw new AppError("No existe un administrador con ese correo.", 404);
  }
  await clearTwoFactor(user._id);
  await recordAudit({
    actorType: "system",
    action: AuditAction.TWO_FACTOR_RESET,
    module: AuditModule.AUTH,
    targetId: user.id as string,
  });
};

export type { RequestContext };
export {
  verifyCode,
  startEnrollment,
  completeEnrollment,
  resetTwoFactor,
  resetAdminTwoFactorByEmail,
};
