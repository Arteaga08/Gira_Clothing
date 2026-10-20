import { OrderPriority, OrderStatus } from "@gira/shared";
import { describe, expect, it, vi } from "vitest";
import { getOrder } from "@/lib/api/adminOrdersServer";
import {
  bulkMarkProcessing,
  fetchOrder,
  getOrderActivity,
  getOrderSummary,
  getOrderTracking,
  listOrders,
  markShipped,
  requestRefund,
  retryLabel,
  updateOrderPriority,
  updateOrderStatus,
  updateShippingAddress,
} from "@/lib/api/adminOrders";
import { jsonResponse, stubFetch } from "../helpers/fetchMock";
import { PUBLIC_ID_SENTINEL, makeRawOrder } from "../helpers/orders";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

const ID = "68f2ab12c3d4e5f6a7b8c9d0";
const BASE = "http://api.test/api/v1/admin/orders";

const ok = (data?: unknown, meta?: unknown) =>
  jsonResponse(200, { status: "success", message: "ok", ...(data === undefined ? {} : { data }), ...(meta ? { meta } : {}) });

const callOf = (mock: ReturnType<typeof stubFetch>) => mock.mock.calls[0] as [string, RequestInit];

describe("listOrders", () => {
  it("pega a /admin/orders con el query y devuelve orders + meta", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ orders: [{ id: ID }] }, { total: 1, page: 1, pages: 1, limit: 20 }));

    const result = await listOrders("status=paid&page=1");

    const [url, init] = callOf(fetchMock);
    expect(url).toBe(`${BASE}?status=paid&page=1`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(result.orders).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });
});

describe("lecturas del detalle", () => {
  it("fetchOrder desempaqueta data.order desde el navegador", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ order: { id: ID } }));
    expect((await fetchOrder(ID)).id).toBe(ID);
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/${ID}`);
  });

  it("getOrderSummary desempaqueta data.summary", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ summary: { countsByStatus: { paid: 2 } } }));
    const summary = await getOrderSummary();
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/summary`);
    expect(summary.countsByStatus.paid).toBe(2);
  });

  it("getOrderTracking desempaqueta data.tracking", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ tracking: { events: [] } }));
    expect((await getOrderTracking(ID)).events).toEqual([]);
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/${ID}/tracking`);
  });

  it("getOrderActivity desempaqueta data.activity", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ activity: [{ action: "order_created" }] }));
    expect(await getOrderActivity(ID)).toHaveLength(1);
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/${ID}/activity`);
  });
});

describe("mutaciones", () => {
  it("updateOrderStatus manda status y motivo opcional con PATCH", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(ok({ order: { id: ID } }));

    await updateOrderStatus(ID, OrderStatus.PROCESSING);
    expect(JSON.parse(String(callOf(fetchMock)[1].body))).toEqual({ status: "processing" });

    fetchMock.mockClear();
    await updateOrderStatus(ID, OrderStatus.CANCELLED, "El cliente lo pidió");
    const [url, init] = callOf(fetchMock);
    expect(url).toBe(`${BASE}/${ID}/status`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ status: "cancelled", reason: "El cliente lo pidió" });
  });

  it("updateOrderPriority manda la prioridad", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ order: { id: ID } }));
    await updateOrderPriority(ID, OrderPriority.URGENT);
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/${ID}/priority`);
    expect(JSON.parse(String(callOf(fetchMock)[1].body))).toEqual({ priority: "urgente" });
  });

  it("updateShippingAddress manda la dirección completa", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ order: { id: ID } }));
    const address = { recipient: "Ana", line1: "Calle 1", district: "Centro", city: "CDMX", state: "CX", postalCode: "06000", country: "MX" };
    await updateShippingAddress(ID, address);
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/${ID}/shipping-address`);
    expect(JSON.parse(String(callOf(fetchMock)[1].body))).toEqual(address);
  });

  it("markShipped y requestRefund hacen POST sin cuerpo", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(ok({ order: { id: ID } }));
    await markShipped(ID);
    await requestRefund(ID);
    const [shipCall, refundCall] = fetchMock.mock.calls as [string, RequestInit][];
    const [shipUrl, shipInit] = shipCall!;
    const [refundUrl, refundInit] = refundCall!;
    expect(shipUrl).toBe(`${BASE}/${ID}/ship`);
    expect(refundUrl).toBe(`${BASE}/${ID}/refund`);
    expect(shipInit.method).toBe("POST");
    expect(refundInit.method).toBe("POST");
    expect(shipInit.body).toBeUndefined();
    expect(refundInit.body).toBeUndefined();
  });

  it("retryLabel devuelve el mensaje, porque la API no manda data", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "Reintentamos generar la guía." }));
    expect(await retryLabel(ID)).toBe("Reintentamos generar la guía.");
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/${ID}/label/retry`);
  });

  it("bulkMarkProcessing manda ids y status processing, y desempaqueta data.result", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ result: { results: [], summary: { updated: 1, unchanged: 0, rejected: 0 } } }));
    const result = await bulkMarkProcessing([ID]);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe(`${BASE}/bulk-status`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ ids: [ID], status: "processing" });
    expect(result.summary.updated).toBe(1);
  });

  it("el mensaje de un 409 llega tal cual en el ApiError", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { status: "fail", message: "Primero marca el pedido «en preparación»." }));
    await expect(markShipped(ID)).rejects.toMatchObject({ status: 409, message: "Primero marca el pedido «en preparación»." });
  });
});

describe("ids inválidos", () => {
  it.each(["abc", "../admin/users", "GC-7KQ3M2XV", `${ID}0`])("%s falla sin llamar a fetch", async (id) => {
    const fetchMock = stubFetch();
    await expect(markShipped(id)).rejects.toMatchObject({ kind: "parse" });
    await expect(getOrderTracking(id)).rejects.toMatchObject({ kind: "parse" });
    await expect(bulkMarkProcessing([ID, id])).rejects.toMatchObject({ kind: "parse" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getOrder (servidor)", () => {
  it("reenvía la cookie, no cachea y desempaqueta data.order", async () => {
    cookiesMock.mockResolvedValue({ get: (name: string) => (name === "gira_session" ? { name, value: "abc" } : undefined) });
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ order: { id: ID, orderNumber: "GC-7KQ3M2XV" } }));

    const order = await getOrder(ID);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe(`${BASE}/${ID}`);
    expect((init.headers as Record<string, string>).cookie).toBe("gira_session=abc");
    expect(init.cache).toBe("no-store");
    expect(order.orderNumber).toBe("GC-7KQ3M2XV");
  });

  it("un id inválido no llega a la API", async () => {
    const fetchMock = stubFetch();
    await expect(getOrder("nope")).rejects.toMatchObject({ kind: "parse" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("el publicId nunca sale del cliente HTTP", () => {
  const leaks = (value: unknown) => JSON.stringify(value).includes(PUBLIC_ID_SENTINEL);

  it("listOrders, fetchOrder y las mutaciones devuelven pedidos sin publicId", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(ok({ orders: [makeRawOrder()], order: makeRawOrder() }, { total: 1, page: 1, pages: 1, limit: 20 }));

    expect(leaks(await listOrders("page=1"))).toBe(false);
    expect(leaks(await fetchOrder(ID))).toBe(false);
    expect(leaks(await updateOrderStatus(ID, OrderStatus.PROCESSING))).toBe(false);
    expect(leaks(await updateOrderPriority(ID, OrderPriority.URGENT))).toBe(false);
    expect(leaks(await markShipped(ID))).toBe(false);
    expect(leaks(await requestRefund(ID))).toBe(false);
  });

  it("getOrder (servidor) tampoco lo entrega a los componentes", async () => {
    cookiesMock.mockResolvedValue({ get: () => ({ name: "gira_session", value: "abc" }) });
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ order: makeRawOrder() }));
    const order = await getOrder(ID);
    expect(leaks(order)).toBe(false);
    expect(order.orderNumber).toBe("GC-7KQ3M2XV");
  });
});
