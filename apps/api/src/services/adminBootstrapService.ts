import { UserRole } from "@gira/shared";
import { User } from "../models/User.js";

/**
 * Admin bootstrap, used by `seed:admin`. Registration only ever produces
 * customers, so the first admin is created here. The operator asserts the
 * email, so the account is born verified; 2FA is enrolled at the first login.
 *
 * Running it on an admin that already exists completes the fields M8.5
 * introduced (names, emailVerified) and drops the legacy `name` — it never
 * touches the password, the second factor or the sessions.
 */

interface AdminInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

type EnsureAdminOutcome = "created" | "updated";

const ensureAdmin = async (input: AdminInput): Promise<EnsureAdminOutcome> => {
  const existing = await User.findOne({ email: input.email }).lean();

  if (!existing) {
    await User.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      password: input.password,
      role: UserRole.ADMIN,
      emailVerified: true,
    });
    return "created";
  }

  if (existing.role !== UserRole.ADMIN) {
    throw new Error("Ese correo pertenece a una cuenta que no es administrador.");
  }

  // `name` is no longer in the schema, so strict mode would drop the $unset.
  await User.updateOne(
    { _id: existing._id },
    {
      $set: { firstName: input.firstName, lastName: input.lastName, emailVerified: true },
      $unset: { name: "" },
    },
    { strict: false },
  );
  return "updated";
};

export type { AdminInput, EnsureAdminOutcome };
export { ensureAdmin };
