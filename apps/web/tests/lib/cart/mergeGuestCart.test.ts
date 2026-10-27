import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { CART_CHANGED_EVENT, GUEST_CART_KEY } from "@/lib/cart/guestCart";
import { mergeGuestCart } from "@/lib/cart/mergeGuestCart";

const { fetchAccountCartLines, setAccountCartQty } = vi.hoisted(() => ({
  fetchAccountCartLines: vi.fn(),
  setAccountCartQty: vi.fn(),
}));

vi.mock("@/lib/api/cart", () => ({ fetchAccountCartLines, setAccountCartQty }));

const V1 = "a".repeat(24);
const V2 = "b".repeat(24);
const V3 = "c".repeat(24);

const seedGuest = (lines: { variantId: string; qty: number }[]) =>
  window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines));
const guestLines = () => JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) ?? "[]") as unknown[];

beforeEach(() => {
  window.localStorage.clear();
  fetchAccountCartLines.mockReset();
  setAccountCartQty.mockReset();
  setAccountCartQty.mockResolvedValue(undefined);
});

describe("mergeGuestCart", () => {
  it("sin carrito de invitado no toca el API", async () => {
    const result = await mergeGuestCart();
    expect(result).toEqual({ moved: 0, dropped: 0, kept: 0 });
    expect(fetchAccountCartLines).not.toHaveBeenCalled();
  });

  it("línea nueva: se sube con su cantidad y el carrito del navegador queda vacío", async () => {
    seedGuest([{ variantId: V1, qty: 2 }]);
    fetchAccountCartLines.mockResolvedValue([]);

    const result = await mergeGuestCart();

    expect(setAccountCartQty).toHaveBeenCalledWith(V1, 2);
    expect(result).toEqual({ moved: 1, dropped: 0, kept: 0 });
    expect(window.localStorage.getItem(GUEST_CART_KEY)).toBeNull();
  });

  it("variante repetida: gana la cantidad mayor, no se suman", async () => {
    seedGuest([{ variantId: V1, qty: 3 }]);
    fetchAccountCartLines.mockResolvedValue([{ variantId: V1, qty: 5 }]);

    await mergeGuestCart();

    // La cuenta ya tenía más: no hace falta escribir.
    expect(setAccountCartQty).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(GUEST_CART_KEY)).toBeNull();
  });

  it("el navegador tenía más que la cuenta: sube la mayor", async () => {
    seedGuest([{ variantId: V1, qty: 7 }]);
    fetchAccountCartLines.mockResolvedValue([{ variantId: V1, qty: 2 }]);

    await mergeGuestCart();

    expect(setAccountCartQty).toHaveBeenCalledWith(V1, 7);
  });

  it("nunca pasa de 20 por línea", async () => {
    seedGuest([{ variantId: V1, qty: 25 }]);
    fetchAccountCartLines.mockResolvedValue([]);

    await mergeGuestCart();

    expect(setAccountCartQty).toHaveBeenCalledWith(V1, 20);
  });

  it("línea rechazada por el API (4xx) se descarta; las demás siguen", async () => {
    seedGuest([
      { variantId: V1, qty: 1 },
      { variantId: V2, qty: 1 },
    ]);
    fetchAccountCartLines.mockResolvedValue([]);
    setAccountCartQty.mockRejectedValueOnce(new ApiError("Esa variante ya no está disponible.", "http", 404));

    const result = await mergeGuestCart();

    expect(setAccountCartQty).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ moved: 1, dropped: 1, kept: 0 });
    expect(window.localStorage.getItem(GUEST_CART_KEY)).toBeNull();
  });

  it.each([[401], [403], [409], [400], [408]])("un %i no es definitivo: la línea se conserva para el siguiente intento", async (status) => {
    seedGuest([{ variantId: V1, qty: 3 }]);
    fetchAccountCartLines.mockResolvedValue([]);
    setAccountCartQty.mockRejectedValueOnce(new ApiError("No pudimos", "http", status));

    const result = await mergeGuestCart();

    expect(result).toEqual({ moved: 0, dropped: 0, kept: 1 });
    expect(guestLines()).toEqual([{ variantId: V1, qty: 3 }]);
  });

  it("solo 404/410 (la variante ya no existe) descartan la línea", async () => {
    seedGuest([{ variantId: V1, qty: 1 }, { variantId: V2, qty: 1 }]);
    fetchAccountCartLines.mockResolvedValue([]);
    setAccountCartQty
      .mockRejectedValueOnce(new ApiError("No existe", "http", 404))
      .mockRejectedValueOnce(new ApiError("Retirada", "http", 410));

    const result = await mergeGuestCart();

    expect(result).toEqual({ moved: 0, dropped: 2, kept: 0 });
    expect(window.localStorage.getItem(GUEST_CART_KEY)).toBeNull();
  });

  it("lo que otra pestaña agregó mientras se fusionaba no se pierde", async () => {
    seedGuest([{ variantId: V1, qty: 2 }]);
    fetchAccountCartLines.mockResolvedValue([]);
    setAccountCartQty.mockImplementationOnce(() => {
      // Otra pestaña agrega una variante nueva y suma a la que se está pasando.
      seedGuest([
        { variantId: V1, qty: 5 },
        { variantId: V3, qty: 1 },
      ]);
      return Promise.resolve();
    });

    await mergeGuestCart();

    // V1 cambió de cantidad (ya no es la que se fusionó) y V3 es nueva: ambas siguen en el navegador.
    expect(guestLines()).toEqual([
      { variantId: V1, qty: 5 },
      { variantId: V3, qty: 1 },
    ]);
  });

  it("falla de red o 5xx conserva la línea para otro intento", async () => {
    seedGuest([
      { variantId: V1, qty: 1 },
      { variantId: V2, qty: 4 },
      { variantId: V3, qty: 1 },
    ]);
    fetchAccountCartLines.mockResolvedValue([]);
    setAccountCartQty
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError("Sin conexión.", "network"))
      .mockRejectedValueOnce(new ApiError("Rate limit", "http", 429));

    const result = await mergeGuestCart();

    expect(result).toEqual({ moved: 1, dropped: 0, kept: 2 });
    expect(guestLines()).toEqual([
      { variantId: V2, qty: 4 },
      { variantId: V3, qty: 1 },
    ]);
  });

  it("si no puede leer el carrito de la cuenta, conserva todo y no lanza", async () => {
    seedGuest([{ variantId: V1, qty: 2 }]);
    fetchAccountCartLines.mockRejectedValue(new ApiError("Sin conexión.", "network"));

    const result = await mergeGuestCart();

    expect(result).toEqual({ moved: 0, dropped: 0, kept: 1 });
    expect(setAccountCartQty).not.toHaveBeenCalled();
    expect(guestLines()).toEqual([{ variantId: V1, qty: 2 }]);
  });

  it("anuncia el cambio para que el contador de la barra se refresque", async () => {
    seedGuest([{ variantId: V1, qty: 1 }]);
    fetchAccountCartLines.mockResolvedValue([]);
    const listener = vi.fn();
    window.addEventListener(CART_CHANGED_EVENT, listener);

    await mergeGuestCart();

    expect(listener).toHaveBeenCalled();
    window.removeEventListener(CART_CHANGED_EVENT, listener);
  });
});
