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

// Force the stub upload adapter (M2): a developer's shell must never leak
// real Cloudinary credentials into the test run.
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;

// Force the stub payment adapter (M3): no test may reach Stripe's network.
// Webhook tests build the real adapter explicitly with a fake key — constructEvent
// is pure crypto and needs no network.
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

import { beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";

// Each test FILE gets its own database on the shared replica set (booted once
// by tests/globalSetup.ts), so the afterEach wipe never touches another file's
// data while both run in parallel.
const dbName = `gira_test_${randomBytes(6).toString("hex")}`;

beforeAll(async () => {
  const uri = process.env.MONGO_TEST_URI;
  if (!uri) throw new Error("globalSetup no expuso MONGO_TEST_URI.");
  await mongoose.connect(uri, { dbName });
  // Unique-index assertions (duplicate slug/sku -> 409) must be deterministic
  // on the very first test — autoIndex builds lazily otherwise.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
