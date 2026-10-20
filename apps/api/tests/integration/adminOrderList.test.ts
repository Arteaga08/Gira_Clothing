import { describe, it, expect } from "vitest";
import request from "supertest";
import { DisputeStatus, OrderPriority, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const BASE = "/api/v1/admin/orders";

const now = (): Date => new Date();
const old = new Date("2025-01-01T12:00:00Z");

const get = async (query = "", path = "") => {
  const cookie = await loginAsAdmin(app);
  return request(app).get(`${BASE}${path}${query}`).set("Cookie", cookie);
};

interface ListedOrder {
  status: string;
  priority: string;
  orderNumber: string;
}
const ordersOf = (res: request.Response): ListedOrder[] => res.body.data.orders as ListedOrder[];

describe("GET /admin/orders/summary", () => {
  it("cuenta por estado y por grupo sin acotar por fecha, con ceros incluidos", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: old });
    await seedOrder({ status: OrderStatus.PROCESSING, total: 1000, createdAt: now() });
    await seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: old });
    await seedOrder({ status: OrderStatus.REFUNDED, total: 1000, createdAt: old });

    const res = await get("", "/summary");

    expect(res.status).toBe(200);
    const s = res.body.data.summary as {
      countsByStatus: Record<string, number>;
      byGroup: Record<string, number>;
      disputed: number;
    };
    expect(s.countsByStatus.paid).toBe(1);
    expect(s.countsByStatus.shipped).toBe(0);
    expect(Object.keys(s.countsByStatus).sort()).toEqual(Object.values(OrderStatus).sort());
    expect(s.byGroup).toEqual({ action: 2, waiting: 1, shipping: 0, problems: 1 });
    expect(s.disputed).toBe(0);
  });

  it("disputed cuenta solo las disputas abiertas", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now(), disputeStatus: DisputeStatus.OPEN });
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now(), disputeStatus: DisputeStatus.LOST });
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now() });

    const res = await get("", "/summary");

    expect(res.body.data.summary.disputed).toBe(1);
  });

  it("exige admin: 401 anónimo y 403 cliente", async () => {
    expect((await request(app).get(`${BASE}/summary`)).status).toBe(401);
    const customerCookie = await loginAsCustomer(app);
    expect((await request(app).get(`${BASE}/summary`).set("Cookie", customerCookie)).status).toBe(403);
  });
});

describe("GET /admin/orders · filtros", () => {
  it("status acepta uno o una lista separada por comas, y rechaza valores desconocidos", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now() });
    await seedOrder({ status: OrderStatus.PROCESSING, total: 1000, createdAt: now() });
    await seedOrder({ status: OrderStatus.SHIPPED, total: 1000, createdAt: now() });

    const two = await get("?status=paid,processing");
    expect(two.status).toBe(200);
    expect(ordersOf(two).map((o) => o.status).sort()).toEqual(["paid", "processing"]);

    expect(ordersOf(await get("?status=shipped"))).toHaveLength(1);
    expect((await get("?status=nope")).status).toBe(400);
    expect((await get("?status=paid,nope")).status).toBe(400);
  });

  it("group filtra por el grupo de operador y se intersecta con status", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now() });
    await seedOrder({ status: OrderStatus.PROCESSING, total: 1000, createdAt: now() });
    await seedOrder({ status: OrderStatus.CANCELLED, total: 1000, createdAt: now() });

    const action = await get("?group=action");
    expect(ordersOf(action).map((o) => o.status).sort()).toEqual(["paid", "processing"]);

    const both = await get("?group=action&status=paid");
    expect(ordersOf(both).map((o) => o.status)).toEqual(["paid"]);

    const disjoint = await get("?group=problems&status=paid");
    expect(ordersOf(disjoint)).toHaveLength(0);

    expect((await get("?group=nope")).status).toBe(400);
  });

  it("priority filtra", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now(), priority: OrderPriority.URGENT });
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now() });

    const res = await get("?priority=urgente");

    expect(ordersOf(res)).toHaveLength(1);
    expect(ordersOf(res)[0]?.priority).toBe("urgente");
    expect((await get("?priority=nope")).status).toBe(400);
  });

  it("orderNumber es coincidencia exacta sin importar mayúsculas; un prefijo es un folio inválido", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now(), orderNumber: "GC-7KQ2M9XA" });
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now(), orderNumber: "GC-7KQ2M9XB" });

    const exact = await get("?orderNumber=gc-7kq2m9xa");
    expect(ordersOf(exact).map((o) => o.orderNumber)).toEqual(["GC-7KQ2M9XA"]);

    expect((await get("?orderNumber=GC-7KQ2M9X")).status).toBe(400);
    expect(ordersOf(await get("?orderNumber=GC-ZZZZZZZZ"))).toHaveLength(0);
    expect((await get("?orderNumber=cualquiera")).status).toBe(400);
  });

  it("search encuentra por nombre, teléfono, correo o prefijo de folio", async () => {
    await seedOrder({
      status: OrderStatus.PAID, total: 1000, createdAt: now(),
      name: "Luisa Fernanda", email: "luisa@example.com", phone: "5512345678", orderNumber: "GC-ABCD2345",
    });
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now(), name: "Otro Cliente" });

    for (const term of ["fernanda", "luisa@example", "5512345678", "gc-abcd"]) {
      const res = await get(`?search=${encodeURIComponent(term)}`);
      expect(ordersOf(res), term).toHaveLength(1);
    }
  });

  it("search NO encuentra por publicId (es una credencial)", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now() });
    const doc = await Order.findOne({}).lean();

    const res = await get(`?search=${encodeURIComponent(doc!.publicId)}`);

    expect(ordersOf(res)).toHaveLength(0);
  });

  it("ninguna respuesta admin de pedidos expone publicId (es una credencial)", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now() });
    const doc = await Order.findOne({}).lean();

    const list = await get();
    const detail = await get("", `/${String(doc!._id)}`);

    expect(ordersOf(list)).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(doc!.publicId);
    expect(JSON.stringify(detail.body)).not.toContain(doc!.publicId);
    expect(detail.body.data.order).not.toHaveProperty("publicId");
    expect(detail.body.data.order.orderNumber).toBe(doc!.orderNumber);
  });

  it("sort solo acepta la lista blanca", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now() });

    expect((await get("?sort=payment.intentId")).status).toBe(400);
    expect((await get("?sort=-priority")).status).toBe(200);
    expect((await get("?sort=total")).status).toBe(200);
  });

  it("ordena por total y pagina con meta", async () => {
    await seedOrder({ status: OrderStatus.PAID, total: 3000, createdAt: now() });
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: now() });
    await seedOrder({ status: OrderStatus.PAID, total: 2000, createdAt: now() });

    const res = await get("?sort=-total&limit=2&page=1");

    expect((res.body.data.orders as { total: number }[]).map((o) => o.total)).toEqual([3000, 2000]);
    expect(res.body.meta).toMatchObject({ total: 3, page: 1, limit: 2, pages: 2 });
  });
});
