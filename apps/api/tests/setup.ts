/**
 * Global test setup. Sets a valid environment BEFORE any module that reads
 * `env` at load time is imported, then boots an in-memory MongoDB shared by the
 * whole run. Collections are wiped between tests for isolation.
 */

const TEST_SECRET = "a".repeat(48);

process.env.NODE_ENV = "test";
process.env.PORT ??= "4000";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/gira-test";
process.env.JWT_SECRET ??= TEST_SECRET;
process.env.JWT_EXPIRES_IN ??= "7d";
process.env.ENCRYPTION_KEY ??= TEST_SECRET;
process.env.CLIENT_URL ??= "http://localhost:3000";
process.env.COOKIE_NAME ??= "gira_session";
process.env.LOG_LEVEL ??= "silent";

import { beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let memoryServer: MongoMemoryServer;

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});
