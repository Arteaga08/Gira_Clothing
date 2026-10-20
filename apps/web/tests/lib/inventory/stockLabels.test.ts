import { STOCK_STATUS_LABELS, stockStatusOf } from "@gira/shared";
import { describe, expect, it } from "vitest";

describe("stockStatusOf", () => {
  it("0 y negativos son agotado", () => {
    expect(stockStatusOf(0, 3)).toBe("out");
    expect(stockStatusOf(-4, 3)).toBe("out");
  });

  it("igual al umbral es bajo y uno encima es ok", () => {
    expect(stockStatusOf(1, 3)).toBe("low");
    expect(stockStatusOf(3, 3)).toBe("low");
    expect(stockStatusOf(4, 3)).toBe("ok");
  });

  it("con umbral 0 nada es bajo", () => {
    expect(stockStatusOf(0, 0)).toBe("out");
    expect(stockStatusOf(1, 0)).toBe("ok");
  });

  it("todas las etiquetas están en español", () => {
    expect(STOCK_STATUS_LABELS).toEqual({ out: "Agotado", low: "Stock bajo", ok: "OK" });
  });
});
