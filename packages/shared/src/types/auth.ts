import type { ApiStatus } from "./apiResponse.js";
import type { PublicUser } from "./user.js";

/** Body of `POST /auth/login`. The second factor travels in its own request (M8.4). */
interface LoginRequest {
  email: string;
  password: string;
}

/** Body of `POST /auth/register`. `role` and `emailVerified` never travel: the server derives them. */
interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/** Body of `POST /auth/verify-email`: the link's token plus the password chosen at signup (anti pre-hijacking). */
interface VerifyEmailRequest {
  token: string;
  password: string;
}

/** Body of `POST /auth/resend-verification` and `POST /auth/forgot-password`. */
interface EmailOnlyRequest {
  email: string;
}

/** Body of `POST /auth/reset-password`. */
interface ResetPasswordRequest {
  token: string;
  password: string;
}

/**
 * Login answers 200 in every success case; `status` says what comes next.
 * Admins never get a session from the password alone: they get a short-lived
 * challenge cookie and must finish through `/auth/2fa/*`.
 */
type LoginResponse =
  | { status: "authenticated"; user: PublicUser }
  | { status: "two_factor_required" }
  | { status: "enrollment_required" };

/** Body of `POST /auth/2fa/verify` and `POST /auth/2fa/enroll/complete`. */
interface TwoFactorCodeRequest {
  code: string;
}

/** `POST /auth/2fa/enroll/start`: QR as a PNG data URL, plus the key for manual entry. */
interface EnrollmentStartResponse {
  qrDataUrl: string;
  manualKey: string;
}

interface MeResponse {
  user: PublicUser;
}

/**
 * What `errorHandler` actually writes on failure — no `data`, no `meta`, no
 * typed error code (apps/api/src/middlewares/errorHandler.ts). `ApiResponse`
 * describes the success shape; this is the error shape, kept separate so a
 * consumer can't assume `data` exists on a 4xx/5xx.
 */
interface ApiErrorBody {
  status: ApiStatus;
  message: string;
}

export type {
  RegisterRequest,
  VerifyEmailRequest,
  EmailOnlyRequest,
  ResetPasswordRequest,
  LoginRequest,
  LoginResponse,
  TwoFactorCodeRequest,
  EnrollmentStartResponse,
  MeResponse,
  ApiErrorBody,
};
