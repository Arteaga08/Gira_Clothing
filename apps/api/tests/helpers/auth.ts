import request from "supertest";
import type { Express } from "express";
import { authenticator } from "otplib";
import { UserRole } from "@gira/shared";
import { User } from "../../src/models/User.js";
import { encryptSecret } from "../../src/utils/crypto.js";

const ORIGIN = "http://localhost:3000";

/** Extracts name=value pairs from a response's Set-Cookie, dropping cleared (empty) cookies. */
const cookieFrom = (res: request.Response): string => {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((c) => String(c).split(";")[0] as string)
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
};

const ADMIN_PASSWORD = "Admin1234";

interface TestAdmin {
  id: string;
  email: string;
  password: string;
  secret: string;
}

interface AdminOptions {
  /** Default true. false creates an admin that still has to enrol. */
  twoFactorEnabled?: boolean;
}

/**
 * TOTP code for the 30-second step `offset` steps from now. Anti-replay
 * (`lastUsedStep`) makes a second login of the same admin inside one step
 * fail, so tests that log in twice use consecutive offsets (the window is ±1).
 */
const totpFor = (secret: string, offset = 0): string =>
  authenticator.clone({ epoch: Date.now() + offset * 30_000 }).generate(secret);

/** Creates an admin directly (register always yields customer). */
const createAdmin = async (options: AdminOptions = {}): Promise<TestAdmin> => {
  const { twoFactorEnabled = true } = options;
  const email = `admin${Date.now()}${Math.random().toString(36).slice(2)}@example.com`;
  const secret = authenticator.generateSecret();
  const user = await User.create({
    firstName: "Admin",
    lastName: "Gira",
    email,
    emailVerified: true,
    password: ADMIN_PASSWORD,
    role: UserRole.ADMIN,
    twoFactor: twoFactorEnabled
      ? { enabled: true, secret: encryptSecret(secret), failedAttempts: 0 }
      : { enabled: false, failedAttempts: 0 },
  });
  return { id: user.id as string, email, password: ADMIN_PASSWORD, secret };
};

/** Password step for an admin: returns the response (challenge cookie inside). */
const passwordLogin = (app: Express, admin: Pick<TestAdmin, "email" | "password">) =>
  request(app)
    .post("/api/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: admin.email, password: admin.password });

/** Full admin login (password + TOTP). Returns the session cookie. */
const loginAdmin = async (app: Express, admin: TestAdmin, offset = 0): Promise<string> => {
  const step1 = await passwordLogin(app, admin);
  const res = await request(app)
    .post("/api/v1/auth/2fa/verify")
    .set("Origin", ORIGIN)
    .set("Cookie", cookieFrom(step1))
    .send({ code: totpFor(admin.secret, offset) });
  return cookieFrom(res);
};

/** Creates a fully enrolled admin and logs in. */
const loginAsAdmin = async (app: Express): Promise<string> => loginAdmin(app, await createAdmin());

const CUSTOMER_PASSWORD = "Cliente123";

interface TestCustomer {
  id: string;
  email: string;
  password: string;
}

interface CustomerOptions {
  email?: string;
  password?: string;
  /** Default true: almost every test needs a customer who can already log in. */
  emailVerified?: boolean;
}

/**
 * Creates a customer straight in the DB. Registration no longer opens a
 * session (verification is mandatory), so tests that only need "a logged-in
 * customer" skip the email round trip; the signup flow has its own tests.
 */
const createCustomer = async (options: CustomerOptions = {}): Promise<TestCustomer> => {
  const {
    email = `cliente${Date.now()}${Math.random().toString(36).slice(2)}@example.com`,
    password = CUSTOMER_PASSWORD,
    emailVerified = true,
  } = options;
  const user = await User.create({
    firstName: "Cliente",
    lastName: "Prueba",
    email,
    password,
    role: UserRole.CUSTOMER,
    emailVerified,
  });
  return { id: user.id as string, email, password };
};

/** Password login for a customer; returns the session cookie. */
const loginCustomer = async (
  app: Express,
  customer: Pick<TestCustomer, "email" | "password">,
): Promise<string> => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: customer.email, password: customer.password });
  return cookieFrom(res);
};

const loginAsCustomer = async (app: Express): Promise<string> =>
  loginCustomer(app, await createCustomer());

export type { TestAdmin, TestCustomer };
export {
  ORIGIN,
  CUSTOMER_PASSWORD,
  createCustomer,
  loginCustomer,
  cookieFrom,
  totpFor,
  createAdmin,
  passwordLogin,
  loginAdmin,
  loginAsAdmin,
  loginAsCustomer,
};
