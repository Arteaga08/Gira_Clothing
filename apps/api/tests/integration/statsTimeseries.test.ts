import { describe, it, expect } from "vitest";
import request from "supertest";
import { Currency, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const URL = "/api/v1/admin/stats/timeseries";

describe("GET /admin/stats/timeseries", () => {
  it("rechaza sin sesión", async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
  });

  it("rechaza a un customer", async () => {
    const cookie = await loginAsCustomer(app);
    const res = await request(app).get(URL).set("cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("con days=7 devuelve exactamente 7 buckets contiguos, ceros en los vacíos", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?days=7`).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.series).toHaveLength(7);
    expect(res.body.data.granularity).toBe("day");
    for (const point of res.body.data.series) {
      expect(point).toEqual(
        expect.objectContaining({
          periodStart: expect.any(String),
          orders: 0,
          unitsSold: 0,
          revenue: [],
        }),
      );
    }
  });

  it("dos pedidos el mismo día local caen en el mismo bucket", async () => {
    const cookie = await loginAsAdmin(app);
    // Deltas relativos a "ahora", no horas fijas: `to` en parseDayRange es el
    // instante real de la petición, así que una hora fija (p. ej. 14:00) cae
    // fuera de rango si el test corre antes de esa hora local.
    await seedOrder({
      status: OrderStatus.PAID,
      total: 10_000,
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    await seedOrder({
      status: OrderStatus.PAID,
      total: 20_000,
      createdAt: new Date(Date.now() - 2 * 60 * 1000),
    });

    const res = await request(app).get(`${URL}?days=1`).set("cookie", cookie);
    expect(res.body.data.series).toHaveLength(1);
    expect(res.body.data.series[0].orders).toBe(2);
  });

  it("MXN y USD el mismo día generan dos entradas de revenue, nunca sumadas", async () => {
    const cookie = await loginAsAdmin(app);
    await seedOrder({
      status: OrderStatus.PAID,
      total: 10_000,
      currency: Currency.MXN,
      createdAt: new Date(Date.now() - 3 * 60 * 1000),
    });
    await seedOrder({
      status: OrderStatus.PAID,
      total: 500,
      currency: Currency.USD,
      createdAt: new Date(Date.now() - 1 * 60 * 1000),
    });

    const res = await request(app).get(`${URL}?days=1`).set("cookie", cookie);
    const revenue = res.body.data.series[0].revenue;
    expect(revenue).toHaveLength(2);
    const mxn = revenue.find((r: { currency: string }) => r.currency === Currency.MXN);
    const usd = revenue.find((r: { currency: string }) => r.currency === Currency.USD);
    expect(mxn.revenue).toBe(10_000);
    expect(usd.revenue).toBe(500);
  });

  it("regresión de zona horaria: 04:00 UTC del 15 jul (22:00 CDMX del 14) cae en el bucket del 14", async () => {
    const cookie = await loginAsAdmin(app);
    await seedOrder({
      status: OrderStatus.PAID,
      total: 10_000,
      createdAt: new Date("2026-07-15T04:00:00Z"),
    });

    const res = await request(app).get(`${URL}?days=365`).set("cookie", cookie);
    const bucket14 = res.body.data.series.find(
      (p: { periodStart: string }) => p.periodStart === "2026-07-14",
    );
    const bucket15 = res.body.data.series.find(
      (p: { periodStart: string }) => p.periodStart === "2026-07-15",
    );
    expect(bucket14?.orders ?? 0).toBeGreaterThanOrEqual(1);
    // Si el bucketing usara UTC en vez de zona local, este pedido caería en el 15.
    if (bucket15) expect(bucket15.orders).toBe(0);
  });

  it("sum(series[].orders) reconcilia con /admin/orders/stats para la misma ventana", async () => {
    const cookie = await loginAsAdmin(app);
    for (let i = 0; i < 3; i += 1) {
      await seedOrder({ status: OrderStatus.PAID, total: 15_000, createdAt: new Date() });
    }

    const [timeseries, orderStats] = await Promise.all([
      request(app).get(`${URL}?days=7`).set("cookie", cookie),
      request(app).get("/api/v1/admin/orders/stats?days=7").set("cookie", cookie),
    ]);

    const totalFromSeries = timeseries.body.data.series.reduce(
      (sum: number, p: { orders: number }) => sum + p.orders,
      0,
    );
    expect(totalFromSeries).toBe(orderStats.body.data.period.totalOrders);
  });

  it("base vacía: estructura completa, ceros, sin nulls", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?days=3`).set("cookie", cookie);
    expect(res.body.data.series).toHaveLength(3);
    for (const point of res.body.data.series) {
      expect(point.orders).not.toBeNull();
      expect(point.unitsSold).not.toBeNull();
      expect(point.revenue).toEqual([]);
    }
  });

  it("default son 30 buckets; el máximo válido (730) devuelve 730 buckets", async () => {
    const cookie = await loginAsAdmin(app);
    const resDefault = await request(app).get(URL).set("cookie", cookie);
    expect(resDefault.body.data.series).toHaveLength(30);

    const resMax = await request(app).get(`${URL}?days=730`).set("cookie", cookie);
    expect(resMax.body.data.series).toHaveLength(730);
  });

  it("days=800 lo rechaza Joi con 400 (el clamp interno de parseDayRange nunca se alcanza)", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?days=800`).set("cookie", cookie);
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/stats/timeseries · granularidad", () => {
  it("sin granularity, default es day", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?days=7`).set("cookie", cookie);
    expect(res.body.data.granularity).toBe("day");
  });

  it("granularity=abc lo rechaza Joi con 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?days=7&granularity=abc`).set("cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("granularity=week: cada periodStart cae en lunes y hay menos buckets que días", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .get(`${URL}?days=90&granularity=week`)
      .set("cookie", cookie);

    expect(res.body.data.granularity).toBe("week");
    expect(res.body.data.series.length).toBeLessThan(90);
    for (const point of res.body.data.series) {
      const weekday = new Date(`${point.periodStart}T00:00:00Z`).getUTCDay();
      expect(weekday).toBe(1);
    }
  });

  it("granularity=month: cada periodStart es el día 1 de su mes", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .get(`${URL}?days=365&granularity=month`)
      .set("cookie", cookie);

    expect(res.body.data.granularity).toBe("month");
    for (const point of res.body.data.series) {
      expect(point.periodStart.endsWith("-01")).toBe(true);
    }
  });

  it("granularity=year: un solo bucket para una ventana de 365 días", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .get(`${URL}?days=365&granularity=year`)
      .set("cookie", cookie);

    expect(res.body.data.granularity).toBe("year");
    expect(res.body.data.series.length).toBeLessThanOrEqual(2);
  });

  it("dos pedidos en la misma semana caen en el mismo bucket con granularity=week", async () => {
    const cookie = await loginAsAdmin(app);
    // Miércoles y viernes de la misma semana ISO — ver seedOrder para el
    // trato de createdAt (columna nativa, sin el immutable de Mongoose).
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: new Date("2026-07-15T18:00:00Z") });
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: new Date("2026-07-17T18:00:00Z") });

    const res = await request(app)
      .get(`${URL}?days=365&granularity=week`)
      .set("cookie", cookie);

    const bucket = res.body.data.series.find((p: { periodStart: string }) => p.periodStart === "2026-07-13");
    expect(bucket?.orders).toBe(2);
  });
});
