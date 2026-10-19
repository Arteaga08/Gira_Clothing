import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcryptjs";
import { UserRole } from "@gira/shared";

/**
 * User model. Password and TOTP secret both use `select: false` and are never
 * returned by default. `role` defaults to CUSTOMER and is never set from a
 * request payload — the seed script and internal logic assign ADMIN.
 */

const SALT_ROUNDS = 12;

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

interface UserAttrs {
  name: string;
  email: string;
  password: string;
  role: UserRole;
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

const userSchema = new Schema<UserAttrs, UserModel, UserMethods>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // `unique` already builds the index — adding `index: true` too makes
    // Mongoose declare it twice and warn on every boot.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.CUSTOMER,
    },
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
userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    next();
    return;
  }
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = function comparePassword(
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// Admin listing's default sort (-createdAt) and the role filter both need this.
userSchema.index({ role: 1, createdAt: -1 });

const User = model<UserAttrs, UserModel>("User", userSchema);

export type { UserAttrs, UserDocument, TwoFactor };
export { User };
