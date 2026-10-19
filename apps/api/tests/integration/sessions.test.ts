import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { Session } from "../../src/models/Session.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { optionalAuth } from "../../src/middlewares/protect.js";
import { signAuthToken, verifyAuthToken } from "../../src/utils/token.js";
import { env } from "../../src/config/env.js";
import { ORIGIN, createCustomer, loginCustomer } from "../helpers/auth.js";

const app = buildApp();

const me = (cookie: string) => request(app).get("/api/v1/auth/me").set("Cookie", cookie);
const post = (path: string, cookie: string) =>
  request(app).post(`/api/v1/auth/${path}`).set("Origin", ORIGIN).set("Cookie", cookie);

const tokenOf = (cookie: string): string => cookie.split("=")[1] as string;

/** Smallest app that shows what optionalAuth decided. */
const optionalApp = express();
optionalApp.use(cookieParser());
optionalApp.get("/who", optionalAuth, (req, res) => {
  res.json({ user: req.user ? String(req.user._id) : null });
});

describe("sesión por dispositivo", () => {
  it("cada login crea su propia sesión con sid en el JWT y vencimiento igual al del token", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    const payload = verifyAuthToken(tokenOf(cookie));
    const session = await Session.findById(payload.sid);
    expect(session).not.toBeNull();
    expect(String(session!.user)).toBe(customer.id);
    expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it("logout cierra solo esta sesión: la del otro dispositivo sigue viva", async () => {
    const customer = await createCustomer();
    const phone = await loginCustomer(app, customer);
    const laptop = await loginCustomer(app, customer);

    const out = await post("logout", phone);
    expect(out.status).toBe(200);
    expect((await me(phone)).status).toBe(401);
    expect((await me(laptop)).status).toBe(200);
  });

  it("logout-all cierra todas, limpia la cookie y se audita", async () => {
    const customer = await createCustomer();
    const phone = await loginCustomer(app, customer);
    const laptop = await loginCustomer(app, customer);

    const out = await post("logout-all", phone);
    expect(out.status).toBe(200);
    expect(String(out.headers["set-cookie"])).toMatch(/gira_session=;/);
    expect((await me(phone)).status).toBe(401);
    expect((await me(laptop)).status).toBe(401);
    expect(await Session.countDocuments({ user: customer.id })).toBe(0);
    expect(await AuditLog.countDocuments({ action: AuditAction.LOGOUT_ALL })).toBe(1);
  });

  it("tras logout-all, re-firmar un sid nuevo con el tv viejo tampoco sirve", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    const { tv } = verifyAuthToken(tokenOf(cookie));
    await post("logout-all", cookie);
    const fresh = await Session.create({ user: customer.id, expiresAt: new Date(Date.now() + 60_000) });
    const stale = signAuthToken({ sub: customer.id, role: "customer", tv, sid: String(fresh._id) });
    expect((await me(`${env.cookieName}=${stale}`)).status).toBe(401);
  });

  it("un token firmado sin sid ya no sirve (sesiones de antes de M8.5)", async () => {
    const customer = await createCustomer();
    const legacy = signAuthToken({ sub: customer.id, role: "customer", tv: 0 } as never);
    expect((await me(`${env.cookieName}=${legacy}`)).status).toBe(401);
  });

  it("si la sesión ya no existe en la DB, el JWT deja de servir aunque su firma sea válida", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    await Session.deleteMany({});
    expect((await me(cookie)).status).toBe(401);
  });

  it("una sesión vencida (aunque el TTL aún no la borre) no sirve", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    await Session.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await me(cookie)).status).toBe(401);
  });

  it("el sid de otra cuenta no sirve aunque exista", async () => {
    const victim = await createCustomer();
    const other = await createCustomer();
    const victimCookie = await loginCustomer(app, victim);
    const { sid } = verifyAuthToken(tokenOf(victimCookie));
    const forged = signAuthToken({ sub: other.id, role: "customer", tv: 0, sid });
    expect((await me(`${env.cookieName}=${forged}`)).status).toBe(401);
  });

  it("subir tokenVersion sigue cerrando todo (2FA y reset dependen de eso)", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    await User.updateOne({ _id: customer.id }, { $inc: { tokenVersion: 1 } });
    expect((await me(cookie)).status).toBe(401);
  });

  it("optionalAuth trata una sesión cerrada como invitado, no como error", async () => {
    const customer = await createCustomer();
    const cookie = await loginCustomer(app, customer);
    const live = await request(optionalApp).get("/who").set("Cookie", cookie);
    expect(live.body.user).toBe(customer.id);

    await post("logout", cookie);
    const after = await request(optionalApp).get("/who").set("Cookie", cookie);
    expect(after.status).toBe(200);
    expect(after.body.user).toBeNull();
  });
});
