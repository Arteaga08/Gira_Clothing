import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { allowedOrigins } from "./config/cors.js";
import { logger } from "./config/logger.js";
import { mongoSanitize } from "./middlewares/mongoSanitize.js";
import { sanitizeInput } from "./middlewares/sanitizeInput.js";
import { verifyOrigin } from "./middlewares/verifyOrigin.js";
import { globalLimiter } from "./middlewares/rateLimit.js";
import { notFound } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { v1Router } from "./routes/v1/index.js";

/**
 * Builds the Express app WITHOUT opening a port or connecting to the DB, so it
 * can be driven by supertest. server.ts owns process lifecycle.
 *
 * Middleware order is exact and load-bearing (BACKEND_SECURITY_GUIDELINES §13 /
 * ECOMMERCE_ARCHITECTURE_GUIDELINES "cadena de middleware").
 */
const buildApp = (): Express => {
  const app = express();

  // NOTE (M3): the Stripe webhook route mounts here with a RAW body parser,
  // BEFORE express.json — signature verification needs the untouched payload.

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());
  app.use(mongoSanitize);
  app.use(sanitizeInput);
  app.use(verifyOrigin);
  app.use(globalLimiter);
  app.use(pinoHttp({ logger }));

  app.use("/api/v1", v1Router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export { buildApp };
