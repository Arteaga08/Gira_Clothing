import { afterEach, describe, expect, it, vi } from "vitest";
import { CART_CHANGED_EVENT, CART_LINE_MAX_QTY, GUEST_CART_KEY, addToGuestCart, countGuestCart } from "@/lib/cart/guestCart";

afterEach(() => window.localStorage.clear());

describe("countGuestCart", () => {
  it("suma las cantidades válidas", () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: "a", qty: 2 }, { variantId: "b", qty: 1 }]));
    expect(countGuestCart()).toBe(3);
  });

  it("ignora cantidades inválidas y datos corruptos", () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ qty: -1 }, { qty: 1.5 }, null, { qty: "2" }, { qty: 4 }]));
    expect(countGuestCart()).toBe(4);
    window.localStorage.setItem(GUEST_CART_KEY, "{no es json");
    expect(countGuestCart()).toBe(0);
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify({ qty: 3 }));
    expect(countGuestCart()).toBe(0);
  });

  it("carrito ausente cuenta cero", () => {
    expect(countGuestCart()).toBe(0);
  });
});

describe("addToGuestCart", () => {
  const stored = () => JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) ?? "[]") as { variantId: string; qty: number }[];

  it("crea la línea, suma una unidad a una existente y avisa al contador", () => {
    const heard = vi.fn();
    window.addEventListener(CART_CHANGED_EVENT, heard);
    expect(addToGuestCart("v1")).toBe(true);
    expect(addToGuestCart("v1")).toBe(true);
    expect(addToGuestCart("v2")).toBe(true);
    window.removeEventListener(CART_CHANGED_EVENT, heard);
    expect(stored()).toEqual([{ variantId: "v1", qty: 2 }, { variantId: "v2", qty: 1 }]);
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it("no pasa del máximo por línea y no avisa", () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: "v1", qty: CART_LINE_MAX_QTY }]));
    const heard = vi.fn();
    window.addEventListener(CART_CHANGED_EVENT, heard);
    expect(addToGuestCart("v1")).toBe(false);
    window.removeEventListener(CART_CHANGED_EVENT, heard);
    expect(stored()[0]?.qty).toBe(CART_LINE_MAX_QTY);
    expect(heard).not.toHaveBeenCalled();
  });

  it("un carrito corrupto se reemplaza sin tronar", () => {
    window.localStorage.setItem(GUEST_CART_KEY, "{no es json");
    expect(addToGuestCart("v1")).toBe(false);
  });

  it("descarta líneas inválidas al escribir", () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ qty: 2 }, null, { variantId: "v9", qty: 1 }]));
    expect(addToGuestCart("v1")).toBe(true);
    expect(stored()).toEqual([{ variantId: "v9", qty: 1 }, { variantId: "v1", qty: 1 }]);
  });
});
