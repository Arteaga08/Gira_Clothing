import { describe, it, expect } from "vitest";
import request from "supertest";
import { OrderStatus, ShipmentStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const URL = "/api/v1/admin/shipments";

const createShipmentFor = async (cookie: string, orderId: string, trackingNumber: string) => {
  return request(app)
    .post(`/api/v1/admin/orders/${orderId}/shipment`)
    .set("cookie", cookie)
    .set("Origin", ORIGIN)
    .send({ carrier: "DHL", trackingNumber });
};

describe("GET /admin/shipments", () => {
  it("rechaza sin sesión", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("rechaza a un customer", async () => {
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(URL).set("cookie", cookie)).status).toBe(403);
  });

  it("lista envíos cruzando varios pedidos, con id y order, sin events", async () => {
    const cookie = await loginAsAdmin(app);
    const orderId = await seedOrder({
      status: OrderStatus.PROCESSING,
      total: 10_000,
      createdAt: new Date(),
    });
    const created = await createShipmentFor(cookie, String(orderId), `TRK${Date.now()}`);
    expect(created.status).toBe(201);

    const res = await request(app).get(URL).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.shipments.length).toBeGreaterThan(0);
    const row = res.body.data.shipments[0];
    expect(row).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        order: expect.any(String),
        orderPublicId: expect.any(String),
      }),
    );
    expect(row).not.toHaveProperty("events");
  });

  it("filtra por status", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?status=in_transit`).set("cookie", cookie);
    expect(res.status).toBe(200);
    for (const row of res.body.data.shipments) expect(row.status).toBe(ShipmentStatus.IN_TRANSIT);
  });

  it("busca por trackingNumber", async () => {
    const cookie = await loginAsAdmin(app);
    const orderId = await seedOrder({
      status: OrderStatus.PROCESSING,
      total: 5_000,
      createdAt: new Date(),
    });
    const tracking = `UNIQ${Date.now()}`;
    const created = await createShipmentFor(cookie, String(orderId), tracking);
    expect(created.status).toBe(201);

    const res = await request(app).get(`${URL}?search=${tracking}`).set("cookie", cookie);
    expect(
      res.body.data.shipments.some((s: { trackingNumber: string }) => s.trackingNumber === tracking),
    ).toBe(true);
  });
});
