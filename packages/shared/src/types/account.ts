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

/** One saved shipping address (M15c). `state` is the Envía two-letter code, `country` is always `MX`. */
interface SavedAddress {
  id: string;
  label: string | null;
  recipient: string;
  line1: string;
  line2: string | null;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

/** Tax data kept for a future invoice; nothing is issued from it yet. */
interface BillingInfo {
  rfc: string;
  legalName: string;
  fiscalRegime: string;
  cfdiUse: string;
  /** Fiscal postal code: can differ from the shipping one. */
  postalCode: string;
}

interface AccountResponse {
  profile: AccountProfile;
  addresses: SavedAddress[];
  billing: BillingInfo | null;
  /** Saved products still on sale: the same number the «Guardados» screen shows. */
  savedCount: number;
}

interface AddressesResponse {
  addresses: SavedAddress[];
}

interface BillingResponse {
  billing: BillingInfo | null;
}

/** Address fields as typed in the form; the phone may carry spaces or dashes. */
interface SaveAddressRequest {
  label?: string | null;
  recipient: string;
  line1: string;
  line2?: string | null;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  country: "MX";
  phone: string;
  /** Create only: make it the default right away (the first address is always the default). */
  makeDefault?: boolean;
}

/** Every field optional, at least one required. `null` clears `label` and `line2`. */
interface UpdateAddressRequest {
  label?: string | null;
  recipient?: string;
  line1?: string;
  line2?: string | null;
  district?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
}

type SaveBillingRequest = BillingInfo;

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

export type {
  AccountProfile,
  AccountResponse,
  UpdateProfileRequest,
  ChangePasswordRequest,
  SavedAddress,
  BillingInfo,
  AddressesResponse,
  BillingResponse,
  SaveAddressRequest,
  UpdateAddressRequest,
  SaveBillingRequest,
};
