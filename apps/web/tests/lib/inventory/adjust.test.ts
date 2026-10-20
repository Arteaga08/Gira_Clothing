import { describe, expect, it } from "vitest";
import { STOCK_REASON_MAX } from "@gira/shared";
import { validateAdjustment } from "@/lib/inventory/adjust";

const stock = { onHand: 10, reserved: 4 };

describe("validateAdjustment · recuento", () => {
  it("un entero válido arma { onHand }", () => {
    expect(validateAdjustment("count", "12", "", stock)).toEqual({ ok: true, body: { onHand: 12 } });
  });

  it("acepta exactamente lo apartado (disponible 0) pero no menos", () => {
    expect(validateAdjustment("count", "4", "", stock).ok).toBe(true);
    const below = validateAdjustment("count", "3", "", stock);
    expect(below).toMatchObject({ ok: false });
    expect(below.ok === false && below.error).toMatch(/apartad/i);
  });

  it("rechaza vacío, decimales, negativos, texto y notación científica", () => {
    for (const bad of ["", "  ", "1.5", "-1", "abc", "1e3", "+5"]) {
      expect(validateAdjustment("count", bad, "", stock).ok, bad).toBe(false);
    }
  });

  it("rechaza pasar del máximo", () => {
    expect(validateAdjustment("count", "1000001", "", stock).ok).toBe(false);
    expect(validateAdjustment("count", "1000000", "", stock).ok).toBe(true);
  });
});

describe("validateAdjustment · movimiento", () => {
  it("acepta +N y -N y arma { delta }", () => {
    expect(validateAdjustment("move", "+24", "", stock)).toEqual({ ok: true, body: { delta: 24 } });
    expect(validateAdjustment("move", "-2", "", stock)).toEqual({ ok: true, body: { delta: -2 } });
    expect(validateAdjustment("move", "5", "", stock)).toEqual({ ok: true, body: { delta: 5 } });
  });

  it("rechaza 0, decimales y texto", () => {
    for (const bad of ["0", "+0", "-0", "", "2.5", "x", "--1"]) {
      expect(validateAdjustment("move", bad, "", stock).ok, bad).toBe(false);
    }
  });

  it("no deja el disponible en negativo: el límite es onHand + delta >= reserved", () => {
    expect(validateAdjustment("move", "-6", "", stock).ok).toBe(true);
    const over = validateAdjustment("move", "-7", "", stock);
    expect(over.ok).toBe(false);
    expect(over.ok === false && over.error).toMatch(/apartad|disponible/i);
  });

  it("rechaza pasar del máximo de movimiento", () => {
    expect(validateAdjustment("move", "100001", "", stock).ok).toBe(false);
    expect(validateAdjustment("move", "100000", "", stock).ok).toBe(true);
  });
});

describe("validateAdjustment · motivo", () => {
  it("es opcional y se recorta", () => {
    expect(validateAdjustment("count", "12", "  Conteo de bodega ", stock)).toEqual({
      ok: true,
      body: { onHand: 12, reason: "Conteo de bodega" },
    });
  });

  it("un motivo solo de espacios no se manda", () => {
    expect(validateAdjustment("move", "1", "   ", stock)).toEqual({ ok: true, body: { delta: 1 } });
  });

  it("acepta el máximo y rechaza uno más", () => {
    expect(validateAdjustment("move", "1", "x".repeat(STOCK_REASON_MAX), stock).ok).toBe(true);
    expect(validateAdjustment("move", "1", "x".repeat(STOCK_REASON_MAX + 1), stock).ok).toBe(false);
  });
});
