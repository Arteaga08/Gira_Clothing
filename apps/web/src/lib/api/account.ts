import type { AccountProfile, ChangePasswordRequest, UpdateProfileRequest, Wire } from "@gira/shared";
import { browserRequest } from "./browser";
import { expectData } from "./request";
import { ACCOUNT_PATH } from "./paths";

/** `PATCH /account/profile`: only the fields sent change; `null` clears an optional one. */
const updateProfile = async (input: UpdateProfileRequest): Promise<Wire<AccountProfile>> => {
  const result = await browserRequest<{ profile: AccountProfile }>(`${ACCOUNT_PATH}/profile`, { method: "PATCH", body: input });
  return expectData(result).profile;
};

/**
 * `PATCH /auth/password`: the current password must match. A wrong one answers 400 (not 401,
 * which here means the session expired); the API closes the other devices and keeps this one.
 */
const changePassword = async (input: ChangePasswordRequest): Promise<void> => {
  await browserRequest("/auth/password", { method: "PATCH", body: input });
};

export { updateProfile, changePassword };
