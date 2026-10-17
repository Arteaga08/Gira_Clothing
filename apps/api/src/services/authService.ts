import { authenticator } from "otplib";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import {
  UserRole,
  AuditAction,
  AuditModule,
  TWO_FACTOR_REQUIRED_MESSAGE,
  TWO_FACTOR_INVALID_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
} from "@gira/shared";
import { User, type UserDocument } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { signAuthToken } from "../utils/token.js";
import { encryptSecret, decryptSecret } from "../utils/crypto.js";
import { recordAudit } from "./auditService.js";

/**
 * Auth business logic — the only layer that touches the User model.
 * Login uses a single generic error for both "no such email" and "wrong
 * password" to prevent user enumeration (BACKEND_SECURITY_GUIDELINES §1).
 */

interface RequestContext {
  ip?: string | undefined;
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
  code?: string;
}

interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  isActive: boolean;
}

const GENERIC_LOGIN_ERROR = INVALID_CREDENTIALS_MESSAGE;

const toPublicUser = (user: UserDocument): PublicUser => ({
  id: user.id as string,
  name: user.name,
  email: user.email,
  role: user.role,
  twoFactorEnabled: user.twoFactor.enabled,
  isActive: user.isActive,
});

// Must match User.SALT_ROUNDS: the decoy and the "email already taken" branch
// have to cost the same as the real work they imitate.
const BCRYPT_ROUNDS = 12;

let decoyHash: Promise<string> | undefined;
/** Valid bcrypt hash of random bytes, computed once; compared against when no real hash exists. */
const getDecoyHash = (): Promise<string> => {
  decoyHash ??= bcrypt.hash(randomBytes(24).toString("hex"), BCRYPT_ROUNDS);
  return decoyHash;
};

/** Computes the decoy hash at boot so the first unknown-email login is not visibly slower. */
const warmAuthDecoy = async (): Promise<void> => {
  await getDecoyHash();
};

/**
 * Registration never reveals whether the email was taken: the caller always
 * gets the same answer, and the taken branch burns the same bcrypt cost as a
 * real signup so response time does not leak it either
 * (BACKEND_SECURITY_GUIDELINES, "Timing-oracle"). Verification email arrives
 * in M8.5, which completes the anti-enumeration flow.
 */
const registerCustomer = async (input: RegisterInput): Promise<void> => {
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    return;
  }

  try {
    // Explicit field assignment — never spread the payload (anti mass-assignment).
    await User.create({
      name: input.name,
      email: input.email,
      password: input.password,
      role: UserRole.CUSTOMER,
    });
  } catch (err) {
    // Lost a race against a concurrent signup of the same email: same outcome.
    if ((err as { code?: number }).code === 11000) return;
    throw err;
  }
};

/** Invalidates every session of the user: protect() compares the JWT's `tv` to this counter. */
const logoutUser = async (userId: string): Promise<void> => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
};

const loginUser = async (
  input: LoginInput,
  ctx: RequestContext,
): Promise<{ user: PublicUser; token: string }> => {
  const user = await User.findOne({ email: input.email }).select("+password");

  if (!user || !user.isActive) {
    // Same bcrypt cost as a wrong password, so timing does not reveal that the
    // account does not exist (or is disabled).
    await bcrypt.compare(input.password, await getDecoyHash());
    await recordAudit({
      actorType: "user",
      action: AuditAction.LOGIN_FAILED,
      module: AuditModule.AUTH,
      ip: ctx.ip,
    });
    throw new AppError(GENERIC_LOGIN_ERROR, 401);
  }

  const passwordOk = await user.comparePassword(input.password);
  if (!passwordOk) {
    await recordAudit({
      actorId: user._id,
      actorType: "user",
      action: AuditAction.LOGIN_FAILED,
      module: AuditModule.AUTH,
      ip: ctx.ip,
    });
    throw new AppError(GENERIC_LOGIN_ERROR, 401);
  }

  // Second factor: when enabled, a valid TOTP is required in addition to the
  // password. The 2FA error is specific — the generic anti-enumeration message
  // only applies to the email/password pair, not to the second factor.
  if (user.twoFactor.enabled) {
    const withSecret = await User.findById(user._id).select("+twoFactor.secret");
    const encrypted = withSecret?.twoFactor.secret;
    if (!input.code) {
      throw new AppError(TWO_FACTOR_REQUIRED_MESSAGE, 401);
    }
    if (!encrypted || !verifyTotp(encrypted, input.code)) {
      throw new AppError(TWO_FACTOR_INVALID_MESSAGE, 401);
    }
  }

  const token = signAuthToken({ sub: user.id as string, role: user.role, tv: user.tokenVersion });

  await recordAudit({
    actorId: user._id,
    actorType: "user",
    action: AuditAction.LOGIN_SUCCESS,
    module: AuditModule.AUTH,
    ip: ctx.ip,
  });

  return { user: toPublicUser(user), token };
};

const getCurrentUser = async (userId: string): Promise<PublicUser> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("Usuario no encontrado.", 404);
  }
  return toPublicUser(user);
};

// --- Two-factor (TOTP) ---------------------------------------------------

const APP_ISSUER = "Gira Clothing";

const verifyTotp = (encryptedSecret: string, code: string): boolean => {
  const secret = decryptSecret(encryptedSecret);
  return authenticator.verify({ token: code, secret });
};

/**
 * Two-step activation (BACKEND_SECURITY_GUIDELINES §2). `setup` generates and
 * stores the encrypted secret with enabled:false ("pending"); `enable` requires
 * a valid TOTP before flipping enabled:true.
 *
 * RE-configuring an ALREADY ACTIVE second factor requires the current code, for
 * the same reason `disableTwoFactor` does: this function turns 2FA off on its
 * way to issuing a new secret, so without the check it is a one-request bypass
 * of the very control `disable` refuses to perform without proof. A stolen
 * session must not be able to strip the second factor by either door.
 */
const setupTwoFactor = async (
  userId: string,
  ctx: RequestContext = {},
  code?: string,
): Promise<{ otpauthUrl: string; secret: string }> => {
  const user = await User.findById(userId).select("+twoFactor.secret");
  if (!user) {
    throw new AppError("Usuario no encontrado.", 404);
  }

  if (user.twoFactor.enabled) {
    if (!code) {
      throw new AppError(
        "Tu verificación en dos pasos ya está activa: ingresa el código actual para reconfigurarla.",
        400,
      );
    }
    if (!user.twoFactor.secret || !verifyTotp(user.twoFactor.secret, code)) {
      throw new AppError("El código de verificación es incorrecto.", 400);
    }
  }

  const secret = authenticator.generateSecret();
  user.twoFactor.secret = encryptSecret(secret);
  user.twoFactor.enabled = false;
  await user.save();

  await recordAudit({
    actorId: user._id,
    actorType: "user",
    action: AuditAction.TWO_FACTOR_SETUP,
    module: AuditModule.AUTH,
    ip: ctx.ip,
  });

  const otpauthUrl = authenticator.keyuri(user.email, APP_ISSUER, secret);
  return { otpauthUrl, secret };
};

const enableTwoFactor = async (
  userId: string,
  code: string,
  ctx: RequestContext,
): Promise<void> => {
  const user = await User.findById(userId).select("+twoFactor.secret");
  if (!user || !user.twoFactor.secret) {
    throw new AppError("Primero debes iniciar la configuración de dos factores.", 400);
  }
  if (!verifyTotp(user.twoFactor.secret, code)) {
    throw new AppError("El código de verificación es incorrecto.", 400);
  }

  user.twoFactor.enabled = true;
  // Any session issued before turning 2FA on no longer reflects the account's
  // real security state — bump the version so those tokens stop working and
  // whoever holds one has to log in again (this time through the 2FA gate).
  user.tokenVersion += 1;
  await user.save();

  await recordAudit({
    actorId: user._id,
    actorType: "user",
    action: AuditAction.TWO_FACTOR_ENABLED,
    module: AuditModule.AUTH,
    ip: ctx.ip,
  });
};

const disableTwoFactor = async (
  userId: string,
  code: string,
  ctx: RequestContext,
): Promise<void> => {
  const user = await User.findById(userId).select("+twoFactor.secret");
  if (!user || !user.twoFactor.enabled || !user.twoFactor.secret) {
    throw new AppError("El segundo factor no está activo.", 400);
  }
  // Disabling also requires a valid TOTP so a stolen session can't turn it off.
  if (!verifyTotp(user.twoFactor.secret, code)) {
    throw new AppError("El código de verificación es incorrecto.", 400);
  }

  user.twoFactor.enabled = false;
  user.twoFactor.secret = undefined;
  // BACKEND_SECURITY_GUIDELINES §2: disabling 2FA must revoke active sessions
  // too, not just flip the flag — a stolen cookie shouldn't survive the
  // account's own security downgrade.
  user.tokenVersion += 1;
  await user.save();

  await recordAudit({
    actorId: user._id,
    actorType: "user",
    action: AuditAction.TWO_FACTOR_DISABLED,
    module: AuditModule.AUTH,
    ip: ctx.ip,
  });
};

export type { RequestContext, RegisterInput, LoginInput, PublicUser };
export {
  warmAuthDecoy,
  logoutUser,
  registerCustomer,
  loginUser,
  getCurrentUser,
  toPublicUser,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
};
