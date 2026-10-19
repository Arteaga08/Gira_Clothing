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
import { createSession, revokeSession, revokeAllSessions } from "./sessionService.js";
import { issueAccountToken } from "./accountTokenService.js";
import { sendVerificationEmail } from "./authMailService.js";

/**
 * Auth business logic — the only layer that touches the User model.
 * Login uses a single generic error for both "no such email" and "wrong
 * password" to prevent user enumeration (BACKEND_SECURITY_GUIDELINES §1).
 */

interface RequestContext {
  ip?: string | undefined;
}

interface RegisterInput {
  firstName: string;
  lastName: string;
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
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  isActive: boolean;
  emailVerified: boolean;
}

const GENERIC_LOGIN_ERROR = INVALID_CREDENTIALS_MESSAGE;
const EMAIL_NOT_VERIFIED_MESSAGE = "Activa tu cuenta con el enlace que te enviamos por correo.";

const toPublicUser = (user: UserDocument): PublicUser => ({
  id: user.id as string,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  twoFactorEnabled: user.twoFactor.enabled,
  isActive: user.isActive,
  emailVerified: user.emailVerified,
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

/** Issues a fresh activation link and emails it without waiting (see authMailService). */
const sendActivationLink = async (user: UserDocument): Promise<void> => {
  const token = await issueAccountToken(user._id, "emailVerification");
  if (token) void sendVerificationEmail({ to: user.email, token });
};

/**
 * Registration never reveals whether the email was taken: the caller always
 * gets the same 201, no session, and every branch pays one bcrypt hash so
 * response time does not leak it either (BACKEND_SECURITY_GUIDELINES,
 * "Timing-oracle"). The email itself is sent without being awaited.
 *
 * - New email: the account is created unverified and gets its link.
 * - Existing, never-verified customer: password and names are replaced and a
 *   new link is issued (killing the old one). Whoever controls the inbox can
 *   always reclaim an address someone else squatted; activating still needs
 *   the password, so the squatter cannot finish without the inbox.
 * - Verified, deactivated or admin account: nothing changes and nothing is sent.
 */
const registerCustomer = async (input: RegisterInput): Promise<void> => {
  const existing = await User.findOne({ email: input.email }).select("+password");

  if (existing) {
    if (existing.role !== UserRole.CUSTOMER || existing.emailVerified || !existing.isActive) {
      await bcrypt.hash(input.password, BCRYPT_ROUNDS);
      return;
    }
    existing.firstName = input.firstName;
    existing.lastName = input.lastName;
    existing.password = input.password; // pre-save hook hashes it: same cost as a signup
    await existing.save();
    await sendActivationLink(existing);
    return;
  }

  let created: UserDocument;
  try {
    // Explicit field assignment — never spread the payload (anti mass-assignment).
    created = await User.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      password: input.password,
      role: UserRole.CUSTOMER,
      emailVerified: false,
    });
  } catch (err) {
    // Lost a race against a concurrent signup of the same email: same outcome.
    if ((err as { code?: number }).code === 11000) return;
    throw err;
  }
  await sendActivationLink(created);
};

/** Closes only the session this request came with; other devices stay signed in. */
const logoutUser = async (sessionId: string): Promise<void> => {
  await revokeSession(sessionId);
};

/** Closes every session of the user (and any open 2FA challenge, via tokenVersion). */
const logoutAllSessions = async (userId: string): Promise<void> => {
  await revokeAllSessions(userId);
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

  // Deliberately AFTER the password check: only someone who already proved
  // the password learns that the account exists but is not active yet.
  if (!user.emailVerified) {
    throw new AppError(EMAIL_NOT_VERIFIED_MESSAGE, 403);
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

/** Opens a per-device session for an authenticated user, signs it and audits the login. */
const issueSession = async (
  user: UserDocument,
  ctx: RequestContext,
): Promise<{ user: PublicUser; token: string }> => {
  const sid = await createSession(user._id);
  const token = signAuthToken({
    sub: user.id as string,
    role: user.role,
    tv: user.tokenVersion,
    sid,
  });

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
  logoutAllSessions,
  registerCustomer,
  loginUser,
  getCurrentUser,
  toPublicUser,
  issueSession,
};
