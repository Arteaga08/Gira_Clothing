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
}

interface UserAttrs {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  twoFactor: TwoFactor;
  isActive: boolean;
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
      default: () => ({ enabled: false }),
    },
    isActive: { type: Boolean, default: true },
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

const User = model<UserAttrs, UserModel>("User", userSchema);

export type { UserAttrs, UserDocument, TwoFactor };
export { User };
