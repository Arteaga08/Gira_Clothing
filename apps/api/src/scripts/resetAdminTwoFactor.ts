import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { logger } from "../config/logger.js";
import { resetAdminTwoFactorByEmail } from "../services/twoFactorService.js";

/**
 * Recovery path for an admin who lost their authenticator app. There is no
 * in-app way around the second factor on purpose: this script, run with
 * database access, is the only door. It turns the factor off, clears any lock
 * and revokes every session, so the admin's next login goes through
 * enrolment again. Audited as a system action.
 *
 * The email must be passed explicitly: unlike the seeder there is deliberately
 * no environment fallback, so this destructive action cannot run by accident.
 *
 * Usage:
 *   pnpm --filter @gira/api 2fa:reset-admin -- --email a@b.com
 */

const resolveEmail = (argv: string[]): string => {
  const index = argv.indexOf("--email");
  const email = index >= 0 ? argv[index + 1] : undefined;
  if (!email) {
    throw new Error("Falta el correo. Usa --email <correo>.");
  }
  return email;
};

const run = async (): Promise<void> => {
  const email = resolveEmail(process.argv.slice(2));
  await connectDB(env.mongoUri);
  await resetAdminTwoFactorByEmail(email);
  logger.info("Verificación en dos pasos reiniciada. En su próximo inicio de sesión deberá configurarla de nuevo.");
};

run()
  .catch((err: unknown) => {
    logger.error({ err }, "No se pudo reiniciar la verificación en dos pasos.");
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectDB();
  });
