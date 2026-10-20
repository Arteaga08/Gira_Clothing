import { describe, it, expect } from "vitest";
import { computeParcel } from "../../src/services/parcelService.js";

const cfg = {
  tareGrams: 150,
  boxLengthCm: 30,
  boxWidthCm: 25,
  boxHeightCm: 5,
  extraUnitHeightCm: 3,
  maxWeightGrams: 20_000,
};

describe("computeParcel", () => {
  it("una prenda: su peso + tara y la caja estándar", () => {
    expect(computeParcel([{ weightGrams: 400, qty: 1 }], cfg)).toEqual({
      weightGrams: 550,
      lengthCm: 30,
      widthCm: 25,
      heightCm: 5,
    });
  });

  it("suma pesos por cantidad y crece la altura por cada prenda extra", () => {
    expect(
      computeParcel([{ weightGrams: 400, qty: 2 }, { weightGrams: 300, qty: 1 }], cfg),
    ).toEqual({ weightGrams: 1_250, lengthCm: 30, widthCm: 25, heightCm: 11 });
  });

  it("rechaza un artículo sin peso configurado (422)", () => {
    expect(() => computeParcel([{ weightGrams: 0, qty: 1 }], cfg)).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it("rechaza un paquete que excede el máximo (422)", () => {
    expect(() => computeParcel([{ weightGrams: 5_000, qty: 5 }], cfg)).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });
});
