import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { AuditAction } from "@gira/shared";
import { ORIGIN, loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app: Express = buildApp();

describe("Admin · Settings", () => {
  let adminCookie: string;

  beforeEach(async () => {
    adminCookie = await loginAsAdmin(app);
  });

  describe("autorización", () => {
    it("GET anónimo responde 401", async () => {
      const res = await request(app).get("/api/v1/admin/settings");
      expect(res.status).toBe(401);
    });

    it("PATCH de las tres secciones anónimo responde 401", async () => {
      for (const section of ["shipping", "currency", "reservation"]) {
        const res = await request(app)
          .patch(`/api/v1/admin/settings/${section}`)
          .set("Origin", ORIGIN)
          .send({});
        expect(res.status).toBe(401);
      }
    });

    it("cliente autenticado responde 403", async () => {
      const customerCookie = await loginAsCustomer(app);
      const res = await request(app)
        .get("/api/v1/admin/settings")
        .set("Cookie", customerCookie);
      expect(res.status).toBe(403);
    });
  });

  describe("lectura", () => {
    it("el primer GET crea el singleton con defaults y lo devuelve", async () => {
      const res = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.settings).toMatchObject({
        shipping: { nationalFee: 15000, internationalFee: 60000, freeShippingThreshold: null },
        currency: { mxnPerUsdCents: 1800, rounding: "up_to_50_cents", supported: ["MXN", "USD"] },
        reservation: { ttlMinutes: 30, cartInactivityDays: 30 },
      });
      expect(res.body.data.settings.id).toBeDefined();
    });

    it("un segundo GET devuelve el mismo id (no crea otro singleton)", async () => {
      const first = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
      const second = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
      expect(second.body.data.settings.id).toBe(first.body.data.settings.id);
    });
  });

  describe("envío", () => {
    it("PATCH nationalFee persiste", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ nationalFee: 12000 });
      expect(res.status).toBe(200);
      expect(res.body.data.settings.shipping.nationalFee).toBe(12000);
    });

    it("freeShippingThreshold: null desactiva el umbral", async () => {
      await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ freeShippingThreshold: 50000 });

      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ freeShippingThreshold: null });
      expect(res.status).toBe(200);
      expect(res.body.data.settings.shipping.freeShippingThreshold).toBeNull();
    });

    it("nationalFee negativo responde 400", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ nationalFee: -1 });
      expect(res.status).toBe(400);
    });

    it("nationalFee no entero responde 400", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ nationalFee: 12.5 });
      expect(res.status).toBe(400);
    });

    it("descarta campos desconocidos (stripUnknown)", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ nationalFee: 11000, notAField: "x" });
      expect(res.status).toBe(200);
      expect(res.body.data.settings.shipping.notAField).toBeUndefined();
    });
  });

  describe("moneda", () => {
    it("PATCH mxnPerUsdCents y rounding persiste", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/currency")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ mxnPerUsdCents: 1785, rounding: "up_to_unit" });
      expect(res.status).toBe(200);
      expect(res.body.data.settings.currency).toMatchObject({
        mxnPerUsdCents: 1785,
        rounding: "up_to_unit",
      });
    });

    it("mxnPerUsdCents 0 responde 400", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/currency")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ mxnPerUsdCents: 0 });
      expect(res.status).toBe(400);
    });

    it("rounding inválido responde 400", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/currency")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ rounding: "wat" });
      expect(res.status).toBe(400);
    });
  });

  describe("reserva", () => {
    it("PATCH ttlMinutes persiste", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/reservation")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ ttlMinutes: 45 });
      expect(res.status).toBe(200);
      expect(res.body.data.settings.reservation.ttlMinutes).toBe(45);
    });

    it("ttlMinutes 0 responde 400", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/reservation")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ ttlMinutes: 0 });
      expect(res.status).toBe(400);
    });

    it("ttlMinutes fuera de tope (10000) responde 400", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/reservation")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ ttlMinutes: 10000 });
      expect(res.status).toBe(400);
    });
  });

  describe("aislamiento de secciones", () => {
    it("PATCH de envío no altera moneda ni reserva", async () => {
      await request(app)
        .patch("/api/v1/admin/settings/currency")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ mxnPerUsdCents: 1900 });
      await request(app)
        .patch("/api/v1/admin/settings/reservation")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ ttlMinutes: 20 });

      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ nationalFee: 9999 });

      expect(res.body.data.settings.currency.mxnPerUsdCents).toBe(1900);
      expect(res.body.data.settings.reservation.ttlMinutes).toBe(20);
    });
  });

  describe("auditoría", () => {
    it("cada PATCH escribe su propia acción, nunca una genérica", async () => {
      await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ nationalFee: 8000 });
      await request(app)
        .patch("/api/v1/admin/settings/currency")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ mxnPerUsdCents: 1750 });
      await request(app)
        .patch("/api/v1/admin/settings/reservation")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ ttlMinutes: 15 });

      const shipping = await AuditLog.countDocuments({
        action: AuditAction.SETTINGS_SHIPPING_UPDATED,
      });
      const currency = await AuditLog.countDocuments({
        action: AuditAction.SETTINGS_CURRENCY_UPDATED,
      });
      const reservation = await AuditLog.countDocuments({
        action: AuditAction.SETTINGS_RESERVATION_UPDATED,
      });
      expect(shipping).toBe(1);
      expect(currency).toBe(1);
      expect(reservation).toBe(1);
    });
  });
});
