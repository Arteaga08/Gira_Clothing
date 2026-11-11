import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { cancelMyOrder, createOrder, findPendingOrder, payMyOrder, previewOrder } from "@/lib/api/orders";
import { quoteCartShipping } from "@/lib/api/shipping";
import { jsonResponse } from "../../helpers/fetchMock";

const ID = "6ad9245c612875b3a4962bb5";
const ok = (data: unknown) => jsonResponse(200, { status: "success", message: "ok", data });
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const call = (i = 0) => fetchMock.mock.calls[i] as [string, RequestInit & { headers: Record<string, string> }];

const ORDER_BODY = {
  useCart: true as const,
  customer: { phone: "5512345678" },
  shipping: { recipient: "E", line1: "L", district: "D", city: "C", state: "CMX", postalCode: "06700", country: "MX" },
  shippingQuote: { quoteId: "q", rateId: "r" },
  termsAccepted: true as const,
};

describe("createOrder", () => {
  it("hace POST /orders con la Idempotency-Key y devuelve la orden y el secreto", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { status: "success", message: "ok", data: { order: { total: 100 }, clientSecret: "s" } }),
    );
    const result = await createOrder(ORDER_BODY, "key-1");
    expect(call()[0]).toBe("http://api.test/api/v1/orders");
    expect(call()[1].method).toBe("POST");
    expect(call()[1].headers["Idempotency-Key"]).toBe("key-1");
    expect(call()[1].credentials).toBe("include");
    expect(JSON.parse(call()[1].body as string)).toEqual(ORDER_BODY);
    expect(result).toEqual({ order: { total: 100 }, clientSecret: "s" });
  });

  it("propaga el error del API tal cual", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { status: "error", message: "Ya tienes un pedido por pagar." }));
    await expect(createOrder(ORDER_BODY, "k")).rejects.toMatchObject({
      status: 409,
      message: "Ya tienes un pedido por pagar.",
    });
  });
});

describe("previewOrder", () => {
  it("hace POST /orders/preview y devuelve el resumen", async () => {
    fetchMock.mockResolvedValueOnce(ok({ summary: { total: 130130 } }));
    const summary = await previewOrder({
      couponCode: "GIRA10",
      shippingQuote: { quoteId: "q", rateId: "r" },
      postalCode: "06700",
    });
    expect(call()[0]).toBe("http://api.test/api/v1/orders/preview");
    expect(call()[1].method).toBe("POST");
    expect(summary).toEqual({ total: 130130 });
  });
});

describe("payMyOrder / cancelMyOrder", () => {
  it("pagar reanuda el intent de ese pedido", async () => {
    fetchMock.mockResolvedValueOnce(ok({ order: { total: 5 }, clientSecret: "s2" }));
    expect(await payMyOrder(ID)).toEqual({ order: { total: 5 }, clientSecret: "s2" });
    expect(call()[0]).toBe(`http://api.test/api/v1/orders/mine/${ID}/payment`);
    expect(call()[1].method).toBe("POST");
  });

  it("cancelar hace POST /cancel y devuelve el pedido", async () => {
    fetchMock.mockResolvedValueOnce(ok({ order: { id: ID } }));
    expect(await cancelMyOrder(ID)).toEqual({ id: ID });
    expect(call()[0]).toBe(`http://api.test/api/v1/orders/mine/${ID}/cancel`);
  });

  it("un id manipulado no llega al API", async () => {
    await expect(payMyOrder("../../admin")).rejects.toBeInstanceOf(ApiError);
    await expect(cancelMyOrder("x")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("findPendingOrder", () => {
  it("filtra por pending_payment y devuelve el primero", async () => {
    fetchMock.mockResolvedValueOnce(ok({ orders: [{ id: ID }] }));
    expect(await findPendingOrder()).toEqual({ id: ID });
    expect(call()[0]).toBe("http://api.test/api/v1/orders/mine?status=pending_payment&limit=1");
  });

  it("sin pendiente devuelve null", async () => {
    fetchMock.mockResolvedValueOnce(ok({ orders: [] }));
    expect(await findPendingOrder()).toBeNull();
  });
});

describe("quoteCartShipping", () => {
  it("cotiza con el carrito de la cuenta (useCart) y devuelve la cotización", async () => {
    fetchMock.mockResolvedValueOnce(ok({ quote: { quoteId: "q", rates: [] } }));
    const quote = await quoteCartShipping({ postalCode: "06700", state: "CMX", city: "CDMX" });
    expect(call()[0]).toBe("http://api.test/api/v1/shipping/quotes");
    expect(JSON.parse(call()[1].body as string)).toEqual({
      useCart: true,
      destination: { postalCode: "06700", state: "CMX", city: "CDMX" },
    });
    expect(quote).toEqual({ quoteId: "q", rates: [] });
  });
});
