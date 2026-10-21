import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { Coupon } from "../../src/models/Coupon.js";
import { resolveCouponForCheckout } from "../../src/services/couponRulesService.js";
import { createCustomer, loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { spyOnMailer, sentTo } from "../helpers/mail.js";

const app = buildApp();
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const url = (id: string) => `/api/v1/admin/customers/${id}/coupons`;
const body = (overrides: Record<string, unknown> = {}) => ({
  code: "GRACIAS-ANA",
  discountType: "percent",
  percentOff: 15,
  message: "Gracias por estar con nosotros.",
  ...overrides,
});
const post = (cookie: string, id: string, payload: Record<string, unknown>) =>
  request(app).post(url(id)).set("Origin", ORIGIN).set("Cookie", cookie).send(payload);

afterEach(() => vi.restoreAllMocks());

describe("POST /admin/customers/:id/coupons", () => {
  it("401 / 403", async () => {
    const ana = await createCustomer();
    expect((await request(app).post(url(ana.id)).set("Origin", ORIGIN).send(body())).status).toBe(401);
    const cookie = await loginAsCustomer(app);
    expect((await post(cookie, ana.id, body())).status).toBe(403);
  });

  it("crea un cupón personal de un solo uso, manda el correo y audita sin PII", async () => {
    const spy = spyOnMailer();
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    const res = await post(cookie, ana.id, body({ minSubtotalMxn: 80_000 }));
    expect(res.status).toBe(201);
    expect(res.body.data.emailSent).toBe(true);
    expect(res.body.data.coupon).toMatchObject({
      code: "GRACIAS-ANA",
      kind: "personal",
      maxRedemptions: 1,
      minSubtotalMxn: 80_000,
      assignedCustomer: { id: ana.id },
    });
    const mails = sentTo(spy, "ana@example.com");
    expect(mails).toHaveLength(1);
    expect(mails[0]!.html).toContain("GRACIAS-ANA");
    expect(mails[0]!.html).toContain("Gracias por estar con nosotros.");

    const audit = await AuditLog.findOne({ action: AuditAction.COUPON_GRANTED }).lean();
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain("ana@example.com");
    expect(JSON.stringify(audit)).not.toContain("Gracias por estar");
  });

  it("solo el cliente asignado lo puede canjear", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    const luis = await createCustomer({ email: "luis@example.com" });
    await post(cookie, ana.id, body());
    await expect(resolveCouponForCheckout("GRACIAS-ANA", oid(luis.id))).rejects.toMatchObject({
      message: "El cupón no es válido.",
    });
    await expect(resolveCouponForCheckout("GRACIAS-ANA", oid(ana.id))).resolves.toBeTruthy();
  });

  it("si el correo falla el cupón queda creado y la respuesta lo avisa", async () => {
    const spy = spyOnMailer();
    spy.mockRejectedValue(new Error("down"));
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer();
    const res = await post(cookie, ana.id, body());
    expect(res.status).toBe(201);
    expect(res.body.data.emailSent).toBe(false);
    expect(await Coupon.countDocuments({ code: "GRACIAS-ANA" })).toBe(1);
  });

  it("409 con el mensaje de código duplicado", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer();
    await post(cookie, ana.id, body());
    const again = await post(cookie, ana.id, body());
    expect(again.status).toBe(409);
    expect(again.body.message).toBe("Ya existe un cupón con este código.");
  });

  it("404 para un cliente inexistente y 400 para datos inválidos", async () => {
    const cookie = await loginAsAdmin(app);
    expect((await post(cookie, String(new mongoose.Types.ObjectId()), body())).status).toBe(404);
    const ana = await createCustomer();
    expect((await post(cookie, ana.id, body({ percentOff: 500 }))).status).toBe(400);
    expect((await post(cookie, ana.id, body({ message: "x".repeat(501) }))).status).toBe(400);
  });

  it("ignora kind, assignedUser, maxRedemptions y name que mande el cliente HTTP", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer();
    const other = await createCustomer({ email: "otro@example.com" });
    const res = await post(
      cookie,
      ana.id,
      body({ kind: "campaign", assignedUser: other.id, maxRedemptions: 50, name: "hack" }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.coupon).toMatchObject({ kind: "personal", maxRedemptions: 1, assignedCustomer: { id: ana.id } });
    expect(res.body.data.coupon.name).not.toBe("hack");
  });
});
