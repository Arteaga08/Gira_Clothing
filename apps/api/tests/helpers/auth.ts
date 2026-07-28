import request from "supertest";
import type { Express } from "express";
import { UserRole } from "@gira/shared";
import { User } from "../../src/models/User.js";

const ORIGIN = "http://localhost:3000";

/** Extracts the session cookie string from a login/register response. */
const cookieFrom = (res: request.Response): string => {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((c) => String(c).split(";")[0]).join("; ");
};

/** Creates an admin directly (register always yields customer) and logs in. */
const loginAsAdmin = async (app: Express): Promise<string> => {
  const email = `admin${Date.now()}${Math.random().toString(36).slice(2)}@example.com`;
  await User.create({ name: "Admin", email, password: "Admin1234", role: UserRole.ADMIN });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password: "Admin1234" });
  return cookieFrom(res);
};

const loginAsCustomer = async (app: Express): Promise<string> => {
  const email = `cliente${Date.now()}${Math.random().toString(36).slice(2)}@example.com`;
  await request(app)
    .post("/api/v1/auth/register")
    .set("Origin", ORIGIN)
    .send({ name: "Cliente", email, password: "Cliente123" });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password: "Cliente123" });
  return cookieFrom(res);
};

export { ORIGIN, cookieFrom, loginAsAdmin, loginAsCustomer };
