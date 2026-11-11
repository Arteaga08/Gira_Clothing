import { CartLineStatus, type CartLineView } from "@gira/shared";
import type { Wire } from "@gira/shared";

type CartLine = Wire<CartLineView>;

interface CartTotals {
  /** MXN centavos, available lines only. */
  subtotal: number;
  /** Units across the available lines. */
  units: number;
  /** Lines that are sold out or retired: shown, marked, and left out of the total. */
  blocked: CartLine[];
  /** False while anything blocks the cart, or when it is empty. */
  canCheckout: boolean;
}

/**
 * What the cart page shows as a total. It is a display figure only: the amount that is charged is
 * always the server's (`POST /orders/preview`), never this one.
 */
const cartTotals = (lines: CartLine[]): CartTotals => {
  const payable = lines.filter((l) => l.status === CartLineStatus.AVAILABLE);
  const blocked = lines.filter((l) => l.status !== CartLineStatus.AVAILABLE);
  return {
    subtotal: payable.reduce((sum, l) => sum + (l.unitPriceMxn ?? 0) * l.qty, 0),
    units: payable.reduce((sum, l) => sum + l.qty, 0),
    blocked,
    canCheckout: payable.length > 0 && blocked.length === 0,
  };
};

export type { CartLine, CartTotals };
export { cartTotals };
