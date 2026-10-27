import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addToAccountCart } from "@/lib/api/cart";
import { jsonResponse } from "../../helpers/fetchMock";

const VARIANT = "6ad9245c612875b3a4962bb5";
const ok = (data: unknown) => jsonResponse(200, { status: "success", message: "ok", data });
const cartWith = (qty: number | null) => ok({ cart: { lines: qty === null ? [] : [{ variantId: VARIANT, qty }] } });

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const call = (index: number) => fetchMock.mock.calls[index] as [string, RequestInit];

describe("addToAccountCart", () => {
  it("lee la cantidad actual y manda la siguiente (el API fija, no suma)", async () => {
    fetchMock.mockResolvedValueOnce(cartWith(2)).mockResolvedValueOnce(cartWith(3));
    expect(await addToAccountCart(VARIANT)).toBe(true);
    expect(call(1)[0]).toBe(`http://api.test/api/v1/cart/lines/${VARIANT}`);
    expect(call(1)[1].method).toBe("PUT");
    expect(call(1)[1].body).toBe(JSON.stringify({ qty: 3 }));
  });

  it("una variante que no estaba entra con cantidad 1", async () => {
    fetchMock.mockResolvedValueOnce(cartWith(null)).mockResolvedValueOnce(cartWith(1));
    await addToAccountCart(VARIANT);
    expect(call(1)[1].body).toBe(JSON.stringify({ qty: 1 }));
  });

  it("suma varias unidades sobre la cantidad actual", async () => {
    fetchMock.mockResolvedValueOnce(cartWith(2)).mockResolvedValueOnce(cartWith(5));
    expect(await addToAccountCart(VARIANT, 3)).toBe(true);
    expect(call(1)[1].body).toBe(JSON.stringify({ qty: 5 }));
  });

  it("rechaza una cantidad que rebasaría el máximo sin escribir", async () => {
    fetchMock.mockResolvedValueOnce(cartWith(19));
    expect(await addToAccountCart(VARIANT, 2)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("en el máximo por línea resuelve false y no escribe", async () => {
    fetchMock.mockResolvedValueOnce(cartWith(20));
    expect(await addToAccountCart(VARIANT)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un id manipulado no sale al API", async () => {
    await expect(addToAccountCart("../x")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si el API rechaza (variante agotada), el error sube con su mensaje", async () => {
    fetchMock
      .mockResolvedValueOnce(cartWith(null))
      .mockResolvedValueOnce(jsonResponse(409, { status: "error", message: "Sin existencias." }));
    await expect(addToAccountCart(VARIANT)).rejects.toMatchObject({ message: "Sin existencias." });
  });
});
