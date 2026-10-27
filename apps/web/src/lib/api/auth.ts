import type {
  EmailOnlyRequest,
  EnrollmentStartResponse,
  LoginRequest,
  LoginResponse,
  PublicUser,
  RegisterRequest,
  ResetPasswordRequest,
  TwoFactorCodeRequest,
  VerifyEmailRequest,
  Wire,
} from "@gira/shared";
import { isApiError } from "./ApiError";
import { browserRequest } from "./browser";
import { expectData } from "./request";

type AuthenticatedResponse = Extract<LoginResponse, { status: "authenticated" }>;

/**
 * `POST /auth/login`: the password step only. It answers 200 in every success
 * case and `status` says what comes next — a session (customers), the 2FA code
 * (admin with the factor on) or enrolment (admin without it). Admins get a
 * short-lived challenge cookie, never a session, from this call; the code goes
 * in a separate request so the password is never sent twice.
 */
const login = async (input: LoginRequest): Promise<Wire<LoginResponse>> => {
  const result = await browserRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email: input.email, password: input.password },
  });

  return expectData(result);
};

const finishWithCode = async (path: string, code: string): Promise<Wire<PublicUser>> => {
  const body: TwoFactorCodeRequest = { code };
  const result = await browserRequest<AuthenticatedResponse>(path, { method: "POST", body });
  return expectData(result).user;
};

/** `POST /auth/2fa/verify`: second step for an admin who already has the factor. */
const verifyTwoFactor = (code: string): Promise<Wire<PublicUser>> =>
  finishWithCode("/auth/2fa/verify", code);

/** `POST /auth/2fa/enroll/start`: QR (PNG data URL) plus the key for manual entry. */
const startEnrollment = async (): Promise<Wire<EnrollmentStartResponse>> => {
  const result = await browserRequest<EnrollmentStartResponse>("/auth/2fa/enroll/start", {
    method: "POST",
  });
  return expectData(result);
};

/** `POST /auth/2fa/enroll/complete`: confirms the first code, turns the factor on, opens the session. */
const completeEnrollment = (code: string): Promise<Wire<PublicUser>> =>
  finishWithCode("/auth/2fa/enroll/complete", code);

/**
 * `POST /auth/logout`. Requires an existing session (`protect`), so a 401
 * here just means the session was already gone — the UI should still end up
 * logged out, not see an error.
 */
const logout = async (): Promise<void> => {
  try {
    await browserRequest("/auth/logout", { method: "POST" });
  } catch (error) {
    if (isApiError(error) && error.status === 401) return;
    throw error;
  }
};

/**
 * `POST /auth/2fa/setup`: turns the factor off with the current code. Every
 * session of the account dies, this browser's included: the next login enrols
 * a new authenticator app.
 */
const resetTwoFactor = async (code: string): Promise<void> => {
  const body: TwoFactorCodeRequest = { code };
  await browserRequest("/auth/2fa/setup", { method: "POST", body });
};

/**
 * `POST /auth/register`: always answers the same 201 whether or not the email already has an
 * account (no enumeration) and never opens a session; the visitor must verify the email first.
 */
const register = async (input: RegisterRequest): Promise<void> => {
  await browserRequest("/auth/register", { method: "POST", body: input });
};

/** `POST /auth/verify-email`: the emailed token plus the password chosen at signup. A wrong password is a 401 and does not burn the link. */
const verifyEmail = async (input: VerifyEmailRequest): Promise<void> => {
  await browserRequest("/auth/verify-email", { method: "POST", body: input });
};

const postEmailOnly = async (path: string, email: string): Promise<void> => {
  const body: EmailOnlyRequest = { email };
  await browserRequest(path, { method: "POST", body });
};

/** `POST /auth/resend-verification`: answers 200 whether or not the account exists; the API spaces links 60 s apart. */
const resendVerification = (email: string): Promise<void> => postEmailOnly("/auth/resend-verification", email);

/** `POST /auth/forgot-password`: answers 200 whether or not the account exists. */
const forgotPassword = (email: string): Promise<void> => postEmailOnly("/auth/forgot-password", email);

/** `POST /auth/reset-password`: sets the new password and closes every session; it does not log in. */
const resetPassword = async (input: ResetPasswordRequest): Promise<void> => {
  await browserRequest("/auth/reset-password", { method: "POST", body: input });
};

/** `POST /auth/logout-all`: closes every device. Like `logout`, a 401 means it was already closed. */
const logoutAll = async (): Promise<void> => {
  try {
    await browserRequest("/auth/logout-all", { method: "POST" });
  } catch (error) {
    if (isApiError(error) && error.status === 401) return;
    throw error;
  }
};

export {
  login,
  verifyTwoFactor,
  startEnrollment,
  completeEnrollment,
  logout,
  resetTwoFactor,
  register,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  logoutAll,
};
