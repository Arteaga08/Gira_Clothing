import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import {
  UserRole,
  AuditAction,
  AuditModule,
  INVALID_CREDENTIALS_MESSAGE,
} from "@gira/shared";
import { User, type UserDocument } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { signAuthToken } from "../utils/token.js";
import type { ChallengePurpose } from "../utils/twoFactorChallenge.js";
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
}

/**
 * Outcome of a correct password. Customers get a session straight away; an
 * admin never does — only a challenge naming the next step (verify the code
 * or enrol the factor), finished through `/auth/2fa/*`.
 */
type LoginResult =
  | { kind: "session"; user: PublicUser; token: string }
  | { kind: "challenge"; purpose: ChallengePurpose; userId: string; tv: number };

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
): Promise<LoginResult> => {
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

  if (user.role === UserRole.ADMIN) {
    // The password alone never opens an admin session. LOGIN_SUCCESS is
    // audited when the session is actually issued (see issueSession).
    return {
      kind: "challenge",
      purpose: user.twoFactor.enabled ? "verify" : "enroll",
      userId: user.id as string,
      tv: user.tokenVersion,
    };
  }

  return { kind: "session", ...(await issueSession(user, ctx)) };
};

/** Signs the session for an authenticated user and audits the login. */
const issueSession = async (
  user: UserDocument,
  ctx: RequestContext,
): Promise<{ user: PublicUser; token: string }> => {
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

export type { RequestContext, RegisterInput, LoginInput, LoginResult, PublicUser };
export {
  warmAuthDecoy,
  logoutUser,
  registerCustomer,
  loginUser,
  getCurrentUser,
  toPublicUser,
  issueSession,
};
