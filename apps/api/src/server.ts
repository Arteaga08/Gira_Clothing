import type { Server } from "node:http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { buildApp } from "./app.js";

/**
 * Process entry point: load env (already validated on import), connect the DB,
 * start listening, and shut down gracefully on signals.
 */

const SHUTDOWN_TIMEOUT_MS = 10_000;

const start = async (): Promise<void> => {
  await connectDB();
  const app = buildApp();
  const server = app.listen(env.port, () => {
    logger.info(`API escuchando en el puerto ${env.port} (${env.nodeEnv})`);
  });

  registerShutdown(server);
};

const registerShutdown = (server: Server): void => {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Recibido ${signal}. Cerrando ordenadamente…`);

    // Safety net: force exit if graceful close hangs.
    const forceTimer = setTimeout(() => {
      logger.error("Cierre forzado tras exceder el tiempo de espera.");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    server.close(() => {
      void disconnectDB()
        .then(() => {
          logger.info("Cierre completado.");
          process.exit(0);
        })
        .catch((err: unknown) => {
          logger.error({ err }, "Error al cerrar la base de datos.");
          process.exit(1);
        });
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection");
    shutdown("unhandledRejection");
  });
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaughtException");
    shutdown("uncaughtException");
  });
};

start().catch((err: unknown) => {
  logger.error({ err }, "No se pudo iniciar el servidor.");
  process.exit(1);
});
