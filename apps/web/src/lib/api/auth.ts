import type { LoginRequest, PublicUser, Wire } from "@gira/shared";
import { isApiError } from "./ApiError";
import { browserRequest } from "./browser";
import { expectData } from "./request";

/**
 * `POST /auth/login`. The API is a single step: credentials plus an optional
 * TOTP `code`. When 2FA is enabled and `code` is missing, the API answers
 * 401 with `TWO_FACTOR_REQUIRED_MESSAGE` — the caller (the login state
 * machine) is the one that recognises that message and re-submits with a
 * code, not this function.
 */
const login = async (input: LoginRequest): Promise<Wire<PublicUser>> => {
  // exactOptionalPropertyTypes: `code` must be omitted, never sent as
  // `undefined` — the API's Joi schema tolerates absence, not garbage.
  const body: LoginRequest = input.code
    ? { email: input.email, password: input.password, code: input.code }
    : { email: input.email, password: input.password };

  const result = await browserRequest<{ user: PublicUser }>("/auth/login", {
    method: "POST",
    body,
  });

  return expectData(result).user;
};

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

export { login, logout };
