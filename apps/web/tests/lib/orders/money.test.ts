import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/orders/money";

describe("formatMoney", () => {
  it("formatea centavos como pesos con separador de miles", () => {
    expect(formatMoney(112000)).toBe("$1,120.00");
  });

  it("maneja cero y centavos sueltos", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(5)).toBe("$0.05");
  });
});
