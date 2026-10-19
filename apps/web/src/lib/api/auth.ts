import type {
  EnrollmentStartResponse,
  LoginRequest,
  LoginResponse,
  PublicUser,
  TwoFactorCodeRequest,
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

export { login, verifyTwoFactor, startEnrollment, completeEnrollment, logout };
