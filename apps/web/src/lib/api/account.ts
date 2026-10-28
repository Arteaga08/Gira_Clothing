import type {
  AccountProfile,
  BillingInfo,
  ChangePasswordRequest,
  SaveAddressRequest,
  SaveBillingRequest,
  SavedAddress,
  UpdateAddressRequest,
  UpdateProfileRequest,
  Wire,
} from "@gira/shared";
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

const ADDRESSES_PATH = `${ACCOUNT_PATH}/addresses`;

/** Every address call answers the whole updated list: the server decides which one is the default. */
const addressList = async (path: string, method: "POST" | "PATCH" | "DELETE", body?: object): Promise<Wire<SavedAddress>[]> =>
  expectData(await browserRequest<{ addresses: SavedAddress[] }>(path, { method, ...(body ? { body } : {}) })).addresses;

/** `POST /account/addresses`: 409 when the customer already has the maximum. */
const createAddress = (input: SaveAddressRequest): Promise<Wire<SavedAddress>[]> => addressList(ADDRESSES_PATH, "POST", input);

/** `PATCH /account/addresses/:id`: only the fields sent change; `null` clears the label and line 2. */
const updateAddress = (id: string, input: UpdateAddressRequest): Promise<Wire<SavedAddress>[]> =>
  addressList(`${ADDRESSES_PATH}/${id}`, "PATCH", input);

const setDefaultAddress = (id: string): Promise<Wire<SavedAddress>[]> => addressList(`${ADDRESSES_PATH}/${id}/default`, "POST");

const deleteAddress = (id: string): Promise<Wire<SavedAddress>[]> => addressList(`${ADDRESSES_PATH}/${id}`, "DELETE");

/** `PUT /account/billing`: replaces the whole block. */
const saveBilling = async (input: SaveBillingRequest): Promise<Wire<BillingInfo>> => {
  const { billing } = expectData(await browserRequest<{ billing: BillingInfo | null }>(`${ACCOUNT_PATH}/billing`, { method: "PUT", body: input }));
  if (!billing) throw new Error("La respuesta no trae los datos fiscales.");
  return billing;
};

const deleteBilling = async (): Promise<void> => {
  await browserRequest(`${ACCOUNT_PATH}/billing`, { method: "DELETE" });
};

export { updateProfile, changePassword, createAddress, updateAddress, setDefaultAddress, deleteAddress, saveBilling, deleteBilling };
