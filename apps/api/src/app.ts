import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import type { Logger } from "pino";
import { allowedOrigins } from "./config/cors.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { mongoSanitize } from "./middlewares/mongoSanitize.js";
import { sanitizeInput } from "./middlewares/sanitizeInput.js";
import { verifyOrigin } from "./middlewares/verifyOrigin.js";
import { materializeQuery } from "./middlewares/materializeQuery.js";
import { createHttpLogger } from "./middlewares/httpLogger.js";
import { notFound } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { v1Router } from "./routes/v1/index.js";
import { webhookRouter } from "./routes/webhookRoutes.js";

/**
 * Builds the Express app WITHOUT opening a port or connecting to the DB, so it
 * can be driven by supertest. server.ts owns process lifecycle.
 *
 * Middleware order is exact and load-bearing (BACKEND_SECURITY_GUIDELINES §13 /
 * ECOMMERCE_ARCHITECTURE_GUIDELINES "cadena de middleware").
 */
interface BuildAppOptions {
  /** Injectable so tests can capture log output. */
  logger?: Logger;
}

const buildApp = ({ logger: appLogger = logger }: BuildAppOptions = {}): Express => {
  const app = express();

  // Must be set BEFORE the limiters, and it is a hop count, never `true`.
  // Without it every request behind a proxy shares one bucket: the login
  // limiter would lock out the whole world after five failures, the checkout
  // limiter would cap the entire store at ten purchases per window, and every
  // AuditLog.ip would record the proxy instead of the caller.
  app.set("trust proxy", env.trustProxyHops);

  app.use(helmet());

  // The Stripe webhook mounts HERE, before every other middleware, with a RAW
  // body parser. Signature verification hashes the exact bytes Stripe sent:
  // express.json would discard them, and mongoSanitize/sanitizeInput would
  // rewrite keys and escape strings, invalidating the HMAC every time.
  //
  // It also sits before the global limiter on purpose — Stripe retries in
  // bursts, and throttling those would cause the exact problem the webhook
  // prevents. The barrier is the cryptographic signature; its own limiter is
  // only a loose ceiling against unsigned junk.
  app.use("/api/webhooks", webhookRouter);

  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());
  // Before the sanitizers: Express 5 re-parses req.query on every read, so
  // without pinning it they would be cleaning a throwaway copy.
  app.use(materializeQuery);
  app.use(mongoSanitize);
  app.use(sanitizeInput);
  app.use(verifyOrigin);
  app.use(createHttpLogger(appLogger));

  app.use("/api/v1", v1Router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export { buildApp };
