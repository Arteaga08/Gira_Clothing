import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { AuditAction, OrderStatus } from "@gira/shared";
import { Order } from "../../src/models/Order.js";
import { seedOrder } from "../helpers/seedOrder.js";
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
        shipping: {
          origin: null,
          freeShippingThreshold: null,
          quoteTtlMinutes: 30,
          parcel: { tareGrams: 150, boxLengthCm: 30, boxWidthCm: 25, boxHeightCm: 5, extraUnitHeightCm: 3, maxWeightGrams: 20000 },
        },
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
    it("PATCH quoteTtlMinutes persiste", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ quoteTtlMinutes: 45 });
      expect(res.status).toBe(200);
      expect(res.body.data.settings.shipping.quoteTtlMinutes).toBe(45);
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

    it("quoteTtlMinutes fuera de rango responde 400", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ quoteTtlMinutes: 1 });
      expect(res.status).toBe(400);
    });

    it("quoteTtlMinutes no entero responde 400", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ quoteTtlMinutes: 12.5 });
      expect(res.status).toBe(400);
    });

    it("guarda origen y paquete por sección, y rechaza estado/CP/teléfono inválidos", async () => {
      const origin = {
        name: "Gira Clothing",
        phone: "5512345678",
        email: "bodega@giraclothing.mx",
        line1: "Av. Reforma 100",
        district: "Juárez",
        city: "Ciudad de México",
        state: "CX",
        postalCode: "06600",
      };
      const ok = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({
          origin,
          freeShippingThreshold: 150000,
          quoteTtlMinutes: 45,
          parcel: { tareGrams: 200, boxHeightCm: 6 },
        });
      expect(ok.status).toBe(200);
      const shipping = ok.body.data.settings.shipping;
      expect(shipping.origin.postalCode).toBe("06600");
      expect(shipping.parcel.tareGrams).toBe(200);
      expect(shipping.parcel.boxHeightCm).toBe(6);
      expect(shipping.parcel.boxLengthCm).toBe(30);

      for (const bad of [{ state: "ZZ" }, { postalCode: "123" }, { phone: "55" }]) {
        const res = await request(app)
          .patch("/api/v1/admin/settings/shipping")
          .set("Origin", ORIGIN)
          .set("Cookie", adminCookie)
          .send({ origin: { ...origin, ...bad } });
        expect(res.status).toBe(400);
      }
    });

    it("un PATCH parcial no pisa el origen guardado", async () => {
      const origin = {
        name: "Gira Clothing",
        phone: "5512345678",
        line1: "Av. Reforma 100",
        district: "Juárez",
        city: "Ciudad de México",
        state: "CX",
        postalCode: "06600",
      };
      await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ origin });
      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ quoteTtlMinutes: 20 });
      expect(res.body.data.settings.shipping.origin.name).toBe("Gira Clothing");
    });

    it("descarta campos desconocidos (stripUnknown)", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ quoteTtlMinutes: 40, notAField: "x" });
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
        .send({ quoteTtlMinutes: 99 });

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
        .send({ quoteTtlMinutes: 60 });
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

  describe("inventario", () => {
    it("actualiza el umbral de bajo stock", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/inventory")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ lowStockThreshold: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.settings.inventory.lowStockThreshold).toBe(5);
    });

    it("rechaza un umbral negativo o no entero", async () => {
      for (const value of [-1, 2.5]) {
        const res = await request(app)
          .patch("/api/v1/admin/settings/inventory")
          .set("Origin", ORIGIN)
          .set("Cookie", adminCookie)
          .send({ lowStockThreshold: value });
        expect(res.status).toBe(400);
      }
    });

    it("no altera las otras secciones", async () => {
      const before = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
      await request(app)
        .patch("/api/v1/admin/settings/inventory")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ lowStockThreshold: 7 });
      const after = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);

      expect(after.body.data.settings.shipping).toEqual(before.body.data.settings.shipping);
      expect(after.body.data.settings.currency).toEqual(before.body.data.settings.currency);
    });

    it("escribe su propia acción de auditoría", async () => {
      await request(app)
        .patch("/api/v1/admin/settings/inventory")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send({ lowStockThreshold: 4 });

      const entry = await AuditLog.findOne({ action: AuditAction.SETTINGS_INVENTORY_UPDATED });
      expect(entry).not.toBeNull();
    });
  });

  describe("IVA", () => {
    const patchTax = (body: Record<string, unknown>) =>
      request(app)
        .patch("/api/v1/admin/settings/tax")
        .set("Origin", ORIGIN)
        .set("Cookie", adminCookie)
        .send(body);

    it("GET expone la tasa vigente (16 % por defecto)", async () => {
      const res = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
      expect(res.body.data.settings.tax).toEqual({ rateBps: 1600 });
    });

    it("PATCH anónimo responde 401", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/settings/tax")
        .set("Origin", ORIGIN)
        .send({ rateBps: 800 });
      expect(res.status).toBe(401);
    });

    it("PATCH persiste la tasa y descarta campos desconocidos", async () => {
      const res = await patchTax({ rateBps: 800, extra: "x" });

      expect(res.status).toBe(200);
      expect(res.body.data.settings.tax).toEqual({ rateBps: 800 });
      const again = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
      expect(again.body.data.settings.tax).toEqual({ rateBps: 800 });
    });

    it("acepta 0 y 10000 como extremos", async () => {
      expect((await patchTax({ rateBps: 0 })).status).toBe(200);
      expect((await patchTax({ rateBps: 10000 })).status).toBe(200);
    });

    it("rechaza tasa ausente, negativa, mayor a 10000, decimal o texto", async () => {
      for (const body of [{}, { rateBps: -1 }, { rateBps: 10001 }, { rateBps: 16.5 }, { rateBps: "16" }]) {
        const res = await patchTax(body);
        expect(res.status).toBe(400);
      }
      const after = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
      expect(after.body.data.settings.tax).toEqual({ rateBps: 1600 });
    });

    it("no altera las otras secciones", async () => {
      const before = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
      await patchTax({ rateBps: 800 });
      const after = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);

      expect(after.body.data.settings.shipping).toEqual(before.body.data.settings.shipping);
      expect(after.body.data.settings.currency).toEqual(before.body.data.settings.currency);
      expect(after.body.data.settings.inventory).toEqual(before.body.data.settings.inventory);
    });

    it("audita el cambio con la tasa de antes y la de después", async () => {
      await patchTax({ rateBps: 800 });

      const entry = await AuditLog.findOne({ action: AuditAction.SETTINGS_TAX_UPDATED }).lean();
      expect(entry?.module).toBe("settings");
      expect(entry?.before).toEqual({ rateBps: 1600 });
      expect(entry?.after).toEqual({ rateBps: 800 });
      expect(entry?.actorId).toBeDefined();
    });

    it("un pedido ya creado conserva su tasa y su IVA", async () => {
      const orderId = await seedOrder({ status: OrderStatus.PAID, total: 11600, createdAt: new Date() });
      const before = await Order.findById(orderId).lean();

      await patchTax({ rateBps: 800 });

      const after = await Order.findById(orderId).lean();
      expect(after?.taxRateBps).toBe(before?.taxRateBps);
      expect(after?.tax).toBe(before?.tax);
      expect(after?.total).toBe(before?.total);
    });
  });
});
