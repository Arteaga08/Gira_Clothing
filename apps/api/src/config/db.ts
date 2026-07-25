import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * MongoDB connection lifecycle. Never logs the URI (may contain credentials).
 */

const connectDB = async (uri: string = env.mongoUri): Promise<void> => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  logger.info("MongoDB conectado");
};

const disconnectDB = async (): Promise<void> => {
  await mongoose.connection.close();
  logger.info("MongoDB desconectado");
};

export { connectDB, disconnectDB };
