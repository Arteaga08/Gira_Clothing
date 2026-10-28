import type { Types } from "mongoose";
import type { AccountProfile, AccountResponse, UpdateProfileRequest } from "@gira/shared";
import { User, type BillingAttrs, type SavedAddressAttrs } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { toSavedAddress } from "./addressService.js";
import { toBillingInfo } from "./billingService.js";
import { listWishlistIds } from "./wishlistService.js";

/**
 * The customer's own profile (M15b). Reads go through an explicit field list
 * and `toAccountProfile`, so a new User field never leaks by accident; writes
 * set field by field (never a spread of the payload).
 */

const PROFILE_SELECT = "firstName lastName email phone birthDate city";
const ACCOUNT_SELECT = `${PROFILE_SELECT} addresses billing`;

interface ProfileRow {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | undefined;
  birthDate?: Date | undefined;
  city?: string | undefined;
}

interface AccountRow extends ProfileRow {
  addresses?: SavedAddressAttrs[] | undefined;
  billing?: BillingAttrs | undefined;
}

const toAccountProfile = (row: ProfileRow): AccountProfile => ({
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  phone: row.phone ?? null,
  birthDate: row.birthDate ? row.birthDate.toISOString().slice(0, 10) : null,
  city: row.city ?? null,
});

/** Everything «Mi cuenta» shows at once: profile, saved addresses, tax data and how many products are saved. */
const getAccount = async (userId: Types.ObjectId): Promise<AccountResponse> => {
  const [row, savedIds] = await Promise.all([
    User.findOne({ _id: userId, isActive: true }).select(ACCOUNT_SELECT).lean<AccountRow>(),
    listWishlistIds(userId),
  ]);
  if (!row) throw new AppError("No encontramos tu cuenta.", 404);
  return {
    profile: toAccountProfile(row),
    addresses: (row.addresses ?? []).map(toSavedAddress),
    billing: toBillingInfo(row.billing),
    savedCount: savedIds.length,
  };
};

type OptionalField = "phone" | "birthDate" | "city";
const OPTIONAL_FIELDS: readonly OptionalField[] = ["phone", "birthDate", "city"];

/** `null` clears an optional field, `undefined` leaves it alone. */
const updateAccountProfile = async (
  userId: Types.ObjectId,
  input: UpdateProfileRequest,
): Promise<AccountProfile> => {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};

  if (input.firstName !== undefined) $set.firstName = input.firstName;
  if (input.lastName !== undefined) $set.lastName = input.lastName;
  for (const field of OPTIONAL_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (value === null) $unset[field] = "";
    else $set[field] = field === "birthDate" ? new Date(`${value}T00:00:00Z`) : value;
  }

  const update: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  const row = await User.findOneAndUpdate({ _id: userId, isActive: true }, update, {
    new: true,
    runValidators: true,
  })
    .select(PROFILE_SELECT)
    .lean<ProfileRow>();
  if (!row) throw new AppError("No encontramos tu cuenta.", 404);
  return toAccountProfile(row);
};

export { getAccount, updateAccountProfile };
