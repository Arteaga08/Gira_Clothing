import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { logger } from "../config/logger.js";
import { ensureAdmin, type AdminInput } from "../services/adminBootstrapService.js";

/**
 * Admin seeder — thin wrapper over `ensureAdmin`. Credentials come from argv
 * or env, never hardcoded. On an admin that already exists it only completes
 * names and emailVerified (password and 2FA untouched).
 *
 * Usage:
 *   pnpm --filter @gira/api seed:admin -- --email a@b.com --password 'S3gura...' \
 *     --first-name 'Manuel' --last-name 'Arteaga'
 *   or set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_FIRST_NAME / ADMIN_LAST_NAME.
 *
 * It prints the database host first: check it before trusting the result.
 */

const FLAGS: Record<string, keyof AdminInput> = {
  "--email": "email",
  "--password": "password",
  "--first-name": "firstName",
  "--last-name": "lastName",
};

const parseArgs = (argv: string[]): Partial<AdminInput> => {
  const out: Partial<AdminInput> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const field = FLAGS[argv[i] ?? ""];
    const value = argv[i + 1];
    if (field && value) out[field] = value;
  }
  return out;
};

const resolveInput = (): AdminInput => {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email ?? process.env.ADMIN_EMAIL;
  const password = args.password ?? process.env.ADMIN_PASSWORD;
  const firstName = args.firstName ?? process.env.ADMIN_FIRST_NAME ?? "Administrador";
  const lastName = args.lastName ?? process.env.ADMIN_LAST_NAME ?? "Gira";

  if (!email || !password) {
    throw new Error(
      "Faltan credenciales. Usa --email y --password (o ADMIN_EMAIL / ADMIN_PASSWORD).",
    );
  }
  return { email: email.toLowerCase().trim(), password, firstName, lastName };
};

/** Host only — never the credentials embedded in the connection string. */
const databaseHost = (uri: string): string => {
  try {
    return new URL(uri).host;
  } catch {
    return "(URI no reconocida)";
  }
};

const seedAdmin = async (): Promise<void> => {
  const input = resolveInput();
  logger.info({ host: databaseHost(env.mongoUri) }, "Base de datos de destino");
  await connectDB(env.mongoUri);

  const outcome = await ensureAdmin(input);
  logger.info(
    outcome === "created"
      ? "Administrador creado correctamente. En su primer inicio de sesión configurará la verificación en dos pasos."
      : "El administrador ya existía: se completaron nombre, apellido y correo verificado. Contraseña y 2FA intactos.",
  );
};

seedAdmin()
  .catch((err: unknown) => {
    logger.error({ err }, "No se pudo crear el administrador.");
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectDB();
  });
