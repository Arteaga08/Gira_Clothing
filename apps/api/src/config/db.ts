import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { enableQueryTiming } from "./queryTiming.js";

/**
 * MongoDB connection lifecycle. Never logs the URI (may contain credentials).
 */

// Global plugins only reach models compiled afterwards; server.ts imports this
// file before the app (and so the models), which makes this the right spot.
if (env.nodeEnv === "development") enableQueryTiming();

const connectDB = async (uri: string = env.mongoUri): Promise<void> => {
  mongoose.set("strictQuery", true);
  // Warm connections: with the default (0) idle sockets are dropped and every
  // burst of parallel requests pays a fresh TLS handshake to the server.
  await mongoose.connect(uri, { minPoolSize: 5 });
  logger.info("MongoDB conectado");
};

const disconnectDB = async (): Promise<void> => {
  await mongoose.connection.close();
  logger.info("MongoDB desconectado");
};

export { connectDB, disconnectDB };
