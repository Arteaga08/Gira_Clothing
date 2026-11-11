import { describe, it, expect } from "vitest";
import { CartLineStatus } from "@gira/shared";
import { cartTotals } from "@/lib/checkout/cartTotals";

const line = (variantId: string, qty: number, status: CartLineStatus, unitPriceMxn?: number) => ({
  variantId,
  qty,
  status,
  ...(unitPriceMxn === undefined ? {} : { unitPriceMxn }),
});

describe("cartTotals", () => {
  it("suma solo las líneas disponibles, en centavos", () => {
    const totals = cartTotals([
      line("a", 2, CartLineStatus.AVAILABLE, 54900),
      line("b", 1, CartLineStatus.AVAILABLE, 24900),
    ]);
    expect(totals.subtotal).toBe(134700);
    expect(totals.units).toBe(3);
    expect(totals.canCheckout).toBe(true);
    expect(totals.blocked).toHaveLength(0);
  });

  it("deja fuera del total las agotadas y las retiradas y bloquea el pago", () => {
    const totals = cartTotals([
      line("a", 1, CartLineStatus.AVAILABLE, 10000),
      line("b", 1, CartLineStatus.OUT_OF_STOCK, 89900),
      line("c", 1, CartLineStatus.RETIRED),
    ]);
    expect(totals.subtotal).toBe(10000);
    expect(totals.units).toBe(1);
    expect(totals.blocked.map((l) => l.variantId)).toEqual(["b", "c"]);
    expect(totals.canCheckout).toBe(false);
  });

  it("un carrito vacío no puede pagar", () => {
    expect(cartTotals([])).toMatchObject({ subtotal: 0, units: 0, canCheckout: false });
  });

  it("una línea disponible sin precio no suma (no inventa un precio)", () => {
    expect(cartTotals([line("a", 2, CartLineStatus.AVAILABLE)]).subtotal).toBe(0);
  });
});
