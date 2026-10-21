import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { COUPON_CODE_TAKEN_MESSAGE } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { Coupon } from "../../src/models/Coupon.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();
const BASE = "/api/v1/admin/coupons";

const percentBody = (overrides: Record<string, unknown> = {}) => ({
  code: "VERANO10",
  name: "Verano 10",
  discountType: "percent",
  percentOff: 10,
  ...overrides,
});

const post = (cookie: string, body: Record<string, unknown>) =>
  request(app).post(BASE).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

const patch = (cookie: string, id: string, body: Record<string, unknown>) =>
  request(app).patch(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

const create = async (cookie: string, overrides: Record<string, unknown> = {}) => {
  const res = await post(cookie, percentBody(overrides));
  return res.body.data.coupon as { id: string; code: string };
};

describe("Admin · Coupon · autorización", () => {
  it("GET anónimo responde 401", async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
  });

  it("POST anónimo responde 401", async () => {
    const res = await request(app).post(BASE).set("Origin", ORIGIN).send(percentBody());
    expect(res.status).toBe(401);
  });

  it("POST como cliente responde 403", async () => {
    const cookie = await loginAsCustomer(app);
    expect((await post(cookie, percentBody())).status).toBe(403);
  });
});

describe("Admin · Coupon · creación", () => {
  it("crea un porcentaje con el código en mayúsculas", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await post(cookie, percentBody({ code: "verano10" }));
    expect(res.status).toBe(201);
    expect(res.body.data.coupon).toMatchObject({
      code: "VERANO10",
      discountType: "percent",
      percentOff: 10,
      status: "active",
      redeemedCount: 0,
      isActive: true,
      minSubtotalMxn: 0,
    });
    expect(res.body.data.coupon.amountOffMxn).toBeUndefined();
  });

  it("crea un monto fijo", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await post(
      cookie,
      { code: "FIJO150", name: "Fijo", discountType: "fixed", amountOffMxn: 15000, minSubtotalMxn: 79900 },
    );
    expect(res.status).toBe(201);
    expect(res.body.data.coupon).toMatchObject({ amountOffMxn: 15000, minSubtotalMxn: 79900 });
    expect(res.body.data.coupon.percentOff).toBeUndefined();
  });

  it.each([
    ["porcentaje sin percentOff", { percentOff: undefined }],
    ["percentOff 0", { percentOff: 0 }],
    ["percentOff 101", { percentOff: 101 }],
    ["percentOff decimal", { percentOff: 10.5 }],
    ["percent con amountOffMxn", { amountOffMxn: 1000 }],
    ["código de 3 caracteres", { code: "ABC" }],
    ["código con espacios", { code: "AB C1" }],
    ["código con caracteres raros", { code: "ÁÉÍÓ-1" }],
    ["nombre vacío", { name: "" }],
    ["maxRedemptions 0", { maxRedemptions: 0 }],
    ["minSubtotalMxn negativo", { minSubtotalMxn: -1 }],
    [
      "fin anterior al inicio",
      { startsAt: "2026-06-10T06:00:00.000Z", endsAt: "2026-06-01T06:00:00.000Z" },
    ],
  ])("400: %s", async (_label, overrides) => {
    const cookie = await loginAsAdmin(app);
    expect((await post(cookie, percentBody(overrides))).status).toBe(400);
  });

  it("400: fixed sin amountOffMxn y fixed con monto menor a $1", async () => {
    const cookie = await loginAsAdmin(app);
    const base = { code: "FIJO0001", name: "Fijo", discountType: "fixed" };
    expect((await post(cookie, base)).status).toBe(400);
    expect((await post(cookie, { ...base, amountOffMxn: 99 })).status).toBe(400);
  });

  it("descarta campos desconocidos (stripUnknown)", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await post(cookie, percentBody({ redeemedCount: 99, isActive: false }));
    expect(res.status).toBe(201);
    expect(res.body.data.coupon.redeemedCount).toBe(0);
    expect(res.body.data.coupon.isActive).toBe(true);
  });

  it("código duplicado responde 409 con el mensaje del campo, sin importar mayúsculas", async () => {
    const cookie = await loginAsAdmin(app);
    await post(cookie, percentBody());
    const res = await post(cookie, percentBody({ code: "verano10" }));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(COUPON_CODE_TAKEN_MESSAGE);
  });

  it("registra auditoría COUPON_CREATED", async () => {
    const cookie = await loginAsAdmin(app);
    await post(cookie, percentBody());
    expect(await AuditLog.countDocuments({ action: "coupon_created", module: "coupons" })).toBe(1);
  });
});

describe("Admin · Coupon · edición", () => {
  it("cambia nombre, fechas, mínimo y tope", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie);
    const res = await patch(cookie, id, {
      name: "Otro nombre",
      minSubtotalMxn: 50000,
      maxRedemptions: 20,
      startsAt: "2026-06-01T06:00:00.000Z",
      endsAt: "2026-08-31T05:59:59.000Z",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.coupon).toMatchObject({
      name: "Otro nombre",
      minSubtotalMxn: 50000,
      maxRedemptions: 20,
      startsAt: "2026-06-01T06:00:00.000Z",
    });
    expect(await AuditLog.countDocuments({ action: "coupon_updated" })).toBe(1);
  });

  it("null limpia fechas y tope", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie, { maxRedemptions: 5, endsAt: "2030-01-01T06:00:00.000Z" });
    const res = await patch(cookie, id, { maxRedemptions: null, endsAt: null });
    expect(res.status).toBe(200);
    expect(res.body.data.coupon.maxRedemptions).toBeUndefined();
    expect(res.body.data.coupon.endsAt).toBeUndefined();
  });

  it("PATCH vacío responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie);
    expect((await patch(cookie, id, {})).status).toBe(400);
  });

  it("sin canjes se puede cambiar código y descuento", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie);
    const res = await patch(cookie, id, { code: "NUEVOCODIGO", percentOff: 20 });
    expect(res.status).toBe(200);
    expect(res.body.data.coupon).toMatchObject({ code: "NUEVOCODIGO", percentOff: 20 });
  });

  it("cambiar de porcentaje a monto fijo limpia el campo anterior y exige el nuevo", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie);
    expect((await patch(cookie, id, { discountType: "fixed" })).status).toBe(400);
    const res = await patch(cookie, id, { discountType: "fixed", amountOffMxn: 20000 });
    expect(res.status).toBe(200);
    expect(res.body.data.coupon.amountOffMxn).toBe(20000);
    expect(res.body.data.coupon.percentOff).toBeUndefined();
  });

  it("con canjes bloquea código, tipo y valor, pero deja el nombre", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie);
    await Coupon.updateOne({ _id: id }, { $set: { redeemedCount: 3 } });
    const locked = "El cupón ya tiene canjes: no se pueden cambiar el código ni el descuento.";
    for (const body of [{ code: "OTROCODIGO" }, { percentOff: 15 }, { discountType: "fixed", amountOffMxn: 5000 }]) {
      const res = await patch(cookie, id, body);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(locked);
    }
    expect((await patch(cookie, id, { name: "Sigue editable" })).status).toBe(200);
    // Re-sending the SAME code/value is not a change.
    expect((await patch(cookie, id, { code: "VERANO10", percentOff: 10 })).status).toBe(200);
  });

  it("el tope no puede bajar de los canjes ya hechos", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie, { maxRedemptions: 10 });
    await Coupon.updateOne({ _id: id }, { $set: { redeemedCount: 4 } });
    const res = await patch(cookie, id, { maxRedemptions: 3 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("El tope no puede ser menor a los canjes ya hechos (4).");
    expect((await patch(cookie, id, { maxRedemptions: 4 })).status).toBe(200);
  });

  it("revalida fin posterior al inicio con los valores resultantes", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie, { startsAt: "2026-06-01T06:00:00.000Z", endsAt: "2026-08-01T06:00:00.000Z" });
    expect((await patch(cookie, id, { endsAt: "2026-05-01T06:00:00.000Z" })).status).toBe(400);
  });

  it("código duplicado al editar responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    await create(cookie, { code: "PRIMERO01" });
    const { id } = await create(cookie, { code: "SEGUNDO01" });
    const res = await patch(cookie, id, { code: "primero01" });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(COUPON_CODE_TAKEN_MESSAGE);
  });
});

describe("Admin · Coupon · retirar y reactivar", () => {
  it("DELETE retira y PATCH isActive:true reactiva, con auditoría", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie);
    const retired = await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(retired.status).toBe(200);
    expect(retired.body.data.coupon).toMatchObject({ isActive: false, status: "retired" });
    expect(await AuditLog.countDocuments({ action: "coupon_deactivated" })).toBe(1);

    const back = await patch(cookie, id, { isActive: true });
    expect(back.body.data.coupon).toMatchObject({ isActive: true, status: "active" });
    expect(await AuditLog.countDocuments({ action: "coupon_reactivated" })).toBe(1);
  });

  it("retirar dos veces no duplica la auditoría", async () => {
    const cookie = await loginAsAdmin(app);
    const { id } = await create(cookie);
    await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(await AuditLog.countDocuments({ action: "coupon_deactivated" })).toBe(1);
  });
});

describe("Admin · Coupon · detalle", () => {
  it("id inválido responde 400 e inexistente 404", async () => {
    const cookie = await loginAsAdmin(app);
    expect((await request(app).get(`${BASE}/no-es-id`).set("Cookie", cookie)).status).toBe(400);
    const res = await request(app)
      .get(`${BASE}/${new mongoose.Types.ObjectId().toString()}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("El cupón no existe.");
  });
});
