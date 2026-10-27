import { describe, it, expect } from "vitest";
import { resolveUnitPrice } from "../../src/utils/unitPrice.js";

describe("resolveUnitPrice", () => {
  it("sin rebaja ni override cobra el precio base", () => {
    expect(resolveUnitPrice({ basePrice: 50000 })).toEqual({ priceMxn: 50000, onSale: false });
  });

  it("con rebaja cobra el precio rebajado y expone el anterior para tacharlo", () => {
    expect(resolveUnitPrice({ basePrice: 50000, salePrice: 39900 })).toEqual({
      priceMxn: 39900,
      compareAtMxn: 50000,
      onSale: true,
    });
  });

  it("el precio especial de la estampa gana a la rebaja y no se tacha", () => {
    expect(resolveUnitPrice({ basePrice: 50000, salePrice: 39900 }, 45000)).toEqual({
      priceMxn: 45000,
      onSale: false,
    });
  });

  it("un precio especial de 0 sigue ganando (?? no || )", () => {
    expect(resolveUnitPrice({ basePrice: 50000, salePrice: 39900 }, 0)).toEqual({ priceMxn: 0, onSale: false });
  });

  it("una rebaja de 0 es una rebaja válida", () => {
    expect(resolveUnitPrice({ basePrice: 50000, salePrice: 0 })).toEqual({
      priceMxn: 0,
      compareAtMxn: 50000,
      onSale: true,
    });
  });

  it("una rebaja corrupta que no baja del precio base se ignora", () => {
    expect(resolveUnitPrice({ basePrice: 50000, salePrice: 50000 })).toEqual({ priceMxn: 50000, onSale: false });
    expect(resolveUnitPrice({ basePrice: 50000, salePrice: 60000 })).toEqual({ priceMxn: 50000, onSale: false });
  });
});
