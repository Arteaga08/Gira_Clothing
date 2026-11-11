import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAccountCart, previewGuestCart, removeAccountCartLine } from "@/lib/api/cart";
import { jsonResponse } from "../../helpers/fetchMock";

const ID = "6ad9245c612875b3a4962bb5";
const ok = (data: unknown) => jsonResponse(200, { status: "success", message: "ok", data });
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const call = (i = 0) => fetchMock.mock.calls[i] as [string, RequestInit];

describe("previewGuestCart", () => {
  it("manda las líneas del navegador a POST /cart/preview y devuelve la vista", async () => {
    const cart = { lines: [{ variantId: ID, qty: 2, status: "available" }] };
    fetchMock.mockResolvedValueOnce(ok({ cart }));
    expect(await previewGuestCart([{ variantId: ID, qty: 2 }])).toEqual(cart);
    expect(call()[0]).toBe("http://api.test/api/v1/cart/preview");
    expect(call()[1].method).toBe("POST");
    expect(JSON.parse(call()[1].body as string)).toEqual({ lines: [{ variantId: ID, qty: 2 }] });
  });

  it("un carrito vacío no llama al API", async () => {
    expect(await previewGuestCart([])).toEqual({ lines: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchAccountCart", () => {
  it("lee la vista completa con el estado de cada línea", async () => {
    const cart = { lines: [{ variantId: ID, qty: 1, status: "retired" }] };
    fetchMock.mockResolvedValueOnce(ok({ cart }));
    expect(await fetchAccountCart()).toEqual(cart);
    expect(call()[0]).toBe("http://api.test/api/v1/cart");
  });
});

describe("removeAccountCartLine", () => {
  it("hace DELETE de la línea", async () => {
    fetchMock.mockResolvedValueOnce(ok({ cart: { lines: [] } }));
    await removeAccountCartLine(ID);
    expect(call()[0]).toBe(`http://api.test/api/v1/cart/lines/${ID}`);
    expect(call()[1].method).toBe("DELETE");
  });
});
