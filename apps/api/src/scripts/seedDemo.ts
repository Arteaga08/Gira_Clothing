import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { logger } from "../config/logger.js";
import { resetDemo, seedDemo, type DemoSeedSummary } from "./demo/demoSeed.js";

/**
 * Demo content for development (catalog, customers, ~90 days of orders).
 * Refuses to run in production. Everything it creates is tracked in a
 * manifest, and `--reset` deletes exactly that and nothing else.
 *
 * Usage:
 *   pnpm --filter @gira/api seed:demo            # seed
 *   pnpm --filter @gira/api seed:demo -- --reset # remove the demo data
 *
 * Demo customers log in with their email and the password `GiraDemo2026`.
 */

/** "cluster.example.net/gira-dev": where it is about to write, without the credentials. */
const describeTarget = (uri: string): string => {
  const afterCredentials = uri.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, "");
  return afterCredentials.split("?")[0] ?? "";
};

const format = (summary: DemoSeedSummary): string =>
  [
    `familias ${summary.families}`,
    `categorías ${summary.categories}`,
    `estampas ${summary.prints}`,
    `productos ${summary.products}`,
    `variantes ${summary.variants}`,
    `clientes ${summary.users}`,
    `pedidos ${summary.orders}`,
  ].join(", ");

const run = async (): Promise<void> => {
  if (env.nodeEnv === "production") {
    throw new Error("seed:demo no corre en producción.");
  }
  const reset = process.argv.slice(2).includes("--reset");
  logger.info(`Base de datos: ${describeTarget(env.mongoUri)}`);
  await connectDB(env.mongoUri);

  if (reset) {
    const removed = await resetDemo();
    logger.info(removed ? `Datos demo borrados: ${format(removed)}.` : "No hay datos demo que borrar.");
    return;
  }
  const created = await seedDemo();
  logger.info(`Datos demo sembrados: ${format(created)}. Contraseña de los clientes demo: GiraDemo2026.`);
};

run()
  .catch((err: unknown) => {
    logger.error({ err }, "No se pudo completar seed:demo.");
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectDB();
  });
