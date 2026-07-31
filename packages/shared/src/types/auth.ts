import type { ApiStatus } from "./apiResponse.js";
import type { PublicUser } from "./user.js";

/**
 * Body of `POST /auth/login`. `code` is the 6-digit TOTP, required only when
 * the account has 2FA enabled — the API's Joi schema allows it to be absent,
 * never an empty string (see apps/api/src/validators/authValidator.ts).
 */
interface LoginRequest {
  email: string;
  password: string;
  code?: string;
}

interface LoginResponse {
  user: PublicUser;
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

export type { LoginRequest, LoginResponse, MeResponse, ApiErrorBody };
