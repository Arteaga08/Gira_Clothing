import { UserRole } from "@gira/shared";
import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { logger } from "../config/logger.js";
import { User } from "../models/User.js";

/**
 * Idempotent admin seeder. Registration only ever produces customers, so the
 * first admin is created here. Credentials come from argv or env — never
 * hardcoded. Running it twice with the same email is a no-op.
 *
 * Usage:
 *   pnpm --filter @gira/api seed:admin -- --email a@b.com --password 'S3gura...' --name 'Admin'
 *   or set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in the environment.
 */

interface AdminInput {
  name: string;
  email: string;
  password: string;
}

const parseArgs = (argv: string[]): Partial<AdminInput> => {
  const out: Partial<AdminInput> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) continue;
    if (key === "--email") out.email = value;
    if (key === "--password") out.password = value;
    if (key === "--name") out.name = value;
  }
  return out;
};

const resolveInput = (): AdminInput => {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email ?? process.env.ADMIN_EMAIL;
  const password = args.password ?? process.env.ADMIN_PASSWORD;
  const name = args.name ?? process.env.ADMIN_NAME ?? "Administrador";

  if (!email || !password) {
    throw new Error(
      "Faltan credenciales. Usa --email y --password (o ADMIN_EMAIL / ADMIN_PASSWORD).",
    );
  }
  return { name, email: email.toLowerCase().trim(), password };
};

const seedAdmin = async (): Promise<void> => {
  const input = resolveInput();
  await connectDB(env.mongoUri);

  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    logger.info("El administrador ya existe. Nada que hacer.");
    return;
  }

  await User.create({
    name: input.name,
    email: input.email,
    password: input.password,
    role: UserRole.ADMIN,
  });
  logger.info("Administrador creado correctamente.");
};

seedAdmin()
  .catch((err: unknown) => {
    logger.error({ err }, "No se pudo crear el administrador.");
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectDB();
  });
