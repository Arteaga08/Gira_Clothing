/** The customer's own profile: what `/account` returns and the profile form edits. */
interface AccountProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  /** Calendar date, `YYYY-MM-DD` (no time, no zone). */
  birthDate: string | null;
  city: string | null;
}

interface AccountResponse {
  profile: AccountProfile;
}

/** Every field optional, at least one required. `null` clears an optional field. */
interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  birthDate?: string | null;
  city?: string | null;
}

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export type { AccountProfile, AccountResponse, UpdateProfileRequest, ChangePasswordRequest };
