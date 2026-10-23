import { afterEach, describe, expect, it } from "vitest";
import { GUEST_CART_KEY, countGuestCart } from "@/lib/cart/guestCart";

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
