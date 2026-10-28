import { Types } from "mongoose";
import { SAVED_ADDRESSES_MAX } from "@gira/shared";
import type { SavedAddress, SaveAddressRequest, UpdateAddressRequest } from "@gira/shared";
import { User, type SavedAddressAttrs } from "../models/User.js";
import { AppError } from "../utils/AppError.js";

/**
 * The customer's saved addresses (M15c), embedded in the User document: the
 * list is small and bounded, so a collection of its own is not worth it.
 * Every write is ONE atomic update, never read-decide-write: the cap lives in
 * the filter of the insert and "exactly one default" is rebuilt inside the same
 * pipeline, so concurrent requests cannot overfill the list or leave two
 * defaults. Ownership lives in the query (`_id` of the user plus the address
 * `_id`): an address that is not yours answers 404, the same as a missing one.
 */

const ACCOUNT_MISSING = "No encontramos tu cuenta.";
const ADDRESS_MISSING = "No encontramos esa dirección.";
const LIMIT_MESSAGE = `Puedes guardar hasta ${String(SAVED_ADDRESSES_MAX)} direcciones. Elimina una para agregar otra.`;

interface AddressRow {
  addresses?: SavedAddressAttrs[] | undefined;
}

const toSavedAddress = (row: SavedAddressAttrs): SavedAddress => ({
  id: String(row._id),
  label: row.label ?? null,
  recipient: row.recipient,
  line1: row.line1,
  line2: row.line2 ?? null,
  district: row.district,
  city: row.city,
  state: row.state,
  postalCode: row.postalCode,
  country: row.country,
  phone: row.phone,
  isDefault: row.isDefault,
});

const toList = (row: AddressRow | null): SavedAddress[] => (row?.addresses ?? []).map(toSavedAddress);

/** An empty string means "nothing typed": it is stored as no value at all. */
const present = (value: string | null | undefined): string | undefined =>
  value === undefined || value === null || value === "" ? undefined : value;

const userFilter = (userId: Types.ObjectId) => ({ _id: userId, isActive: true });
const ownedFilter = (userId: Types.ObjectId, addressId: string) => ({
  ...userFilter(userId),
  "addresses._id": new Types.ObjectId(addressId),
});

/** Pipeline updates are not cast by Mongoose, so values go in as plain data and `$literal` keeps a "$..." text from being read as a field path. */
const currentAddresses = { $ifNull: ["$addresses", []] };

const listAddresses = async (userId: Types.ObjectId): Promise<SavedAddress[]> => {
  const row = await User.findOne(userFilter(userId)).select("addresses").lean<AddressRow>();
  if (!row) throw new AppError(ACCOUNT_MISSING, 404);
  return toList(row);
};

const createAddress = async (userId: Types.ObjectId, input: SaveAddressRequest): Promise<SavedAddress[]> => {
  const makeDefault = input.makeDefault === true;
  const fields: Record<string, unknown> = {
    _id: new Types.ObjectId(),
    recipient: input.recipient,
    line1: input.line1,
    district: input.district,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    country: input.country,
    phone: input.phone,
  };
  const label = present(input.label);
  const line2 = present(input.line2);
  if (label !== undefined) fields.label = label;
  if (line2 !== undefined) fields.line2 = line2;

  const row = await User.findOneAndUpdate(
    { ...userFilter(userId), [`addresses.${String(SAVED_ADDRESSES_MAX - 1)}`]: { $exists: false } },
    [
      {
        $set: {
          addresses: {
            $concatArrays: [
              makeDefault
                ? {
                    $map: {
                      input: currentAddresses,
                      as: "address",
                      in: { $mergeObjects: ["$$address", { isDefault: false }] },
                    },
                  }
                : currentAddresses,
              [
                {
                  $mergeObjects: [
                    { $literal: fields },
                    { isDefault: makeDefault ? true : { $eq: [{ $size: currentAddresses }, 0] } },
                  ],
                },
              ],
            ],
          },
        },
      },
    ],
    { new: true },
  )
    .select("addresses")
    .lean<AddressRow>();

  if (row) return toList(row);
  // No match: either the account is gone or the list is full.
  if (await User.exists(userFilter(userId))) throw new AppError(LIMIT_MESSAGE, 409);
  throw new AppError(ACCOUNT_MISSING, 404);
};

/** `null` (or an empty string) clears `label` and `line2`; `undefined` leaves a field alone. `country` and `isDefault` are never written here. */
const updateAddress = async (
  userId: Types.ObjectId,
  addressId: string,
  input: UpdateAddressRequest,
): Promise<SavedAddress[]> => {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};

  for (const field of ["recipient", "line1", "district", "city", "state", "postalCode", "phone"] as const) {
    const value = input[field];
    if (value !== undefined) $set[`addresses.$.${field}`] = value;
  }
  for (const field of ["label", "line2"] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (present(value) === undefined) $unset[`addresses.$.${field}`] = "";
    else $set[`addresses.$.${field}`] = value;
  }

  const update: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  const row = await User.findOneAndUpdate(ownedFilter(userId, addressId), update, {
    new: true,
    runValidators: true,
  })
    .select("addresses")
    .lean<AddressRow>();
  if (!row) throw new AppError(ADDRESS_MISSING, 404);
  return toList(row);
};

const setDefaultAddress = async (userId: Types.ObjectId, addressId: string): Promise<SavedAddress[]> => {
  const id = new Types.ObjectId(addressId);
  const row = await User.findOneAndUpdate(
    ownedFilter(userId, addressId),
    [
      {
        $set: {
          addresses: {
            $map: {
              input: "$addresses",
              as: "address",
              in: { $mergeObjects: ["$$address", { isDefault: { $eq: ["$$address._id", id] } }] },
            },
          },
        },
      },
    ],
    { new: true },
  )
    .select("addresses")
    .lean<AddressRow>();
  if (!row) throw new AppError(ADDRESS_MISSING, 404);
  return toList(row);
};

/** Removing the default promotes the first of the rest, so a non-empty list always has one. */
const deleteAddress = async (userId: Types.ObjectId, addressId: string): Promise<SavedAddress[]> => {
  const id = new Types.ObjectId(addressId);
  const row = await User.findOneAndUpdate(
    ownedFilter(userId, addressId),
    [
      {
        $set: {
          addresses: {
            $let: {
              vars: {
                kept: { $filter: { input: "$addresses", cond: { $ne: ["$$this._id", id] } } },
                removedDefault: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: "$addresses",
                          cond: { $and: [{ $eq: ["$$this._id", id] }, { $eq: ["$$this.isDefault", true] }] },
                        },
                      },
                    },
                    0,
                  ],
                },
              },
              in: {
                $cond: [
                  { $and: ["$$removedDefault", { $gt: [{ $size: "$$kept" }, 0] }] },
                  {
                    $concatArrays: [
                      [{ $mergeObjects: [{ $arrayElemAt: ["$$kept", 0] }, { isDefault: true }] }],
                      { $slice: ["$$kept", 1, { $size: "$$kept" }] },
                    ],
                  },
                  "$$kept",
                ],
              },
            },
          },
        },
      },
    ],
    { new: true },
  )
    .select("addresses")
    .lean<AddressRow>();
  if (!row) throw new AppError(ADDRESS_MISSING, 404);
  return toList(row);
};

export { toSavedAddress, listAddresses, createAddress, updateAddress, setDefaultAddress, deleteAddress };
