import { authenticator } from "otplib";
import { UserRole, AuditAction, AuditModule } from "@gira/shared";
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

const GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos.";

const toPublicUser = (user: UserDocument): PublicUser => ({
  id: user.id as string,
  name: user.name,
  email: user.email,
  role: user.role,
  twoFactorEnabled: user.twoFactor.enabled,
  isActive: user.isActive,
});

const registerCustomer = async (input: RegisterInput): Promise<PublicUser> => {
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    throw new AppError("Ya existe una cuenta con ese correo.", 409);
  }

  // Explicit field assignment — never spread the payload (anti mass-assignment).
  const user = await User.create({
    name: input.name,
    email: input.email,
    password: input.password,
    role: UserRole.CUSTOMER,
  });

  return toPublicUser(user);
};

const loginUser = async (
  input: LoginInput,
  ctx: RequestContext,
): Promise<{ user: PublicUser; token: string }> => {
  const user = await User.findOne({ email: input.email }).select("+password");

  if (!user || !user.isActive) {
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
      throw new AppError("Se requiere el código de verificación de dos factores.", 401);
    }
    if (!encrypted || !verifyTotp(encrypted, input.code)) {
      throw new AppError("El código de verificación es incorrecto.", 401);
    }
  }

  const token = signAuthToken({ sub: user.id as string, role: user.role });

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
 */
const setupTwoFactor = async (
  userId: string,
  ctx: RequestContext = {},
): Promise<{ otpauthUrl: string; secret: string }> => {
  const user = await User.findById(userId).select("+twoFactor.secret");
  if (!user) {
    throw new AppError("Usuario no encontrado.", 404);
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
  registerCustomer,
  loginUser,
  getCurrentUser,
  toPublicUser,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
};
