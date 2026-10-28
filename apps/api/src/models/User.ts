import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcryptjs";
import {
  UserRole,
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  CITY_MAX_LENGTH,
  ADDRESS_LABEL_MAX_LENGTH,
  LEGAL_NAME_MAX_LENGTH,
  RFC_PATTERN,
  MEXICAN_STATE_CODES,
  FISCAL_REGIME_CODES,
  CFDI_USE_CODES,
} from "@gira/shared";
import type { Types } from "mongoose";

/**
 * User model. Password and TOTP secret both use `select: false` and are never
 * returned by default. `role` defaults to CUSTOMER and is never set from a
 * request payload — the seed script and internal logic assign ADMIN.
 */

const SALT_ROUNDS = 12;

/** The one place a password is hashed: the pre-save hook and atomic updates (reset) share it. */
const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, SALT_ROUNDS);

interface TwoFactor {
  enabled: boolean;
  secret?: string | undefined; // AES-256-GCM encrypted at rest, select: false
  /** TOTP time step of the last accepted code: a step can be used once (anti-replay). */
  lastUsedStep?: number | undefined;
  /** Wrong codes since the last success or lock; reset when the account locks. */
  failedAttempts: number;
  /** While in the future, the account accepts no codes at all. */
  lockedUntil?: Date | undefined;
}

/**
 * One-time link (email verification or password reset). Only the sha256 of
 * the token is stored; the raw value exists solely inside the email. One
 * subdocument per kind, so issuing a new link overwrites — and kills — the
 * previous one.
 */
interface AccountToken {
  tokenHash: string;
  expiresAt: Date;
  /** When it was issued: drives the 60 s cooldown between emails. */
  issuedAt: Date;
}

/** A saved shipping address (M15c). At most one has `isDefault`; the service enforces it, never the schema. */
interface SavedAddressAttrs {
  _id: Types.ObjectId;
  label?: string | undefined;
  recipient: string;
  line1: string;
  line2?: string | undefined;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

/** Tax data kept for a future invoice. PII: never logged or audited. */
interface BillingAttrs {
  rfc: string;
  legalName: string;
  fiscalRegime: string;
  cfdiUse: string;
  postalCode: string;
}

interface UserAttrs {
  firstName: string;
  lastName: string;
  email: string;
  /** Optional profile data the customer edits in «Mi cuenta» (M15b). */
  phone?: string | undefined;
  birthDate?: Date | undefined;
  city?: string | undefined;
  /** Saved addresses, capped at SAVED_ADDRESSES_MAX by the service's atomic update. */
  addresses?: SavedAddressAttrs[] | undefined;
  billing?: BillingAttrs | undefined;
  password: string;
  role: UserRole;
  emailVerified: boolean;
  emailVerification?: AccountToken | undefined;
  passwordReset?: AccountToken | undefined;
  twoFactor: TwoFactor;
  isActive: boolean;
  tokenVersion: number;
}

interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type UserModel = Model<UserAttrs, Record<string, never>, UserMethods>;
type UserDocument = HydratedDocument<UserAttrs, UserMethods>;

const twoFactorSchema = new Schema<TwoFactor>(
  {
    enabled: { type: Boolean, default: false },
    secret: { type: String, select: false },
    lastUsedStep: { type: Number },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
  { _id: false },
);

const accountTokenSchema = new Schema<AccountToken>(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    issuedAt: { type: Date, required: true },
  },
  { _id: false },
);

const savedAddressSchema = new Schema<SavedAddressAttrs>({
  label: { type: String, trim: true, maxlength: ADDRESS_LABEL_MAX_LENGTH },
  recipient: { type: String, required: true, trim: true, maxlength: 120 },
  line1: { type: String, required: true, trim: true, maxlength: 200 },
  line2: { type: String, trim: true, maxlength: 200 },
  district: { type: String, required: true, trim: true, maxlength: 120 },
  city: { type: String, required: true, trim: true, maxlength: 120 },
  state: { type: String, required: true, enum: MEXICAN_STATE_CODES },
  postalCode: { type: String, required: true, match: POSTAL_CODE_PATTERN },
  country: { type: String, required: true, uppercase: true, enum: ["MX"] },
  phone: { type: String, required: true, match: PHONE_PATTERN },
  isDefault: { type: Boolean, default: false },
});

const billingSchema = new Schema<BillingAttrs>(
  {
    rfc: { type: String, required: true, uppercase: true, trim: true, match: RFC_PATTERN },
    legalName: { type: String, required: true, trim: true, maxlength: LEGAL_NAME_MAX_LENGTH },
    fiscalRegime: { type: String, required: true, enum: FISCAL_REGIME_CODES },
    cfdiUse: { type: String, required: true, enum: CFDI_USE_CODES },
    postalCode: { type: String, required: true, match: POSTAL_CODE_PATTERN },
  },
  { _id: false },
);

const userSchema = new Schema<UserAttrs, UserModel, UserMethods>(
  {
    // Separate on purpose: shipping labels and invoices use them apart.
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    // `unique` already builds the index — adding `index: true` too makes
    // Mongoose declare it twice and warn on every boot.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, match: PHONE_PATTERN },
    // Calendar date stored as UTC midnight; the API reads and writes it as YYYY-MM-DD.
    birthDate: { type: Date },
    city: { type: String, trim: true, maxlength: CITY_MAX_LENGTH },
    addresses: { type: [savedAddressSchema], default: undefined },
    billing: { type: billingSchema },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.CUSTOMER,
    },
    // Never taken from a payload: only the verification link, a password
    // reset (which proves the inbox too) or the admin seed set it.
    emailVerified: { type: Boolean, default: false },
    emailVerification: { type: accountTokenSchema, select: false },
    passwordReset: { type: accountTokenSchema, select: false },
    twoFactor: {
      type: twoFactorSchema,
      default: () => ({ enabled: false, failedAttempts: 0 }),
    },
    isActive: { type: Boolean, default: true },
    // Bumped whenever every existing session must be invalidated at once
    // (logout, enrolling or resetting 2FA). The JWT carries the version it was
    // signed with; `protect` rejects a token whose version doesn't match
    // the user's current one (BACKEND_SECURITY_GUIDELINES §2, session
    // revocation on 2FA changes).
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Hash only when the password actually changed (BACKEND_SECURITY_GUIDELINES §1).
userSchema.pre("save", async function hashModifiedPassword(next) {
  if (!this.isModified("password")) {
    next();
    return;
  }
  this.password = await hashPassword(this.password);
  next();
});

userSchema.methods.comparePassword = function comparePassword(
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// Admin listing's default sort (-createdAt) and the role filter both need this.
userSchema.index({ role: 1, createdAt: -1 });
// Link lookups by token hash. Partial: most users have no live link.
userSchema.index(
  { "emailVerification.tokenHash": 1 },
  { partialFilterExpression: { "emailVerification.tokenHash": { $exists: true } } },
);
userSchema.index(
  { "passwordReset.tokenHash": 1 },
  { partialFilterExpression: { "passwordReset.tokenHash": { $exists: true } } },
);

const User = model<UserAttrs, UserModel>("User", userSchema);

export type { UserAttrs, UserDocument, TwoFactor, AccountToken, SavedAddressAttrs, BillingAttrs };
export { User, hashPassword };
