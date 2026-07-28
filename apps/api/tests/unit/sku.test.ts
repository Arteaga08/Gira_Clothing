import { describe, it, expect } from "vitest";
import { normalizeSku, buildVariantSku } from "../../src/utils/sku.js";

describe("normalizeSku", () => {
  it("pone en mayúsculas y reemplaza separadores por guiones", () => {
    expect(normalizeSku("flr 001")).toBe("FLR-001");
  });

  it("recorta guiones sobrantes al inicio y al final", () => {
    expect(normalizeSku("--flr--")).toBe("FLR");
  });
});

describe("buildVariantSku", () => {
  it("compone producto y estampado en mayúsculas", () => {
    expect(buildVariantSku("tote-bag", "FLR-001")).toBe("TOTE-BAG-FLR-001");
  });

  it("normaliza minúsculas y acentos", () => {
    expect(buildVariantSku("bárbara mini", "lun 02")).toBe("BARBARA-MINI-LUN-02");
  });

  it("no deja guiones sobrantes al inicio ni al final", () => {
    expect(buildVariantSku("--tote--", "--flr--")).toBe("TOTE-FLR");
  });

  it("trunca a 48 caracteres", () => {
    expect(buildVariantSku("a".repeat(60), "b".repeat(60)).length).toBeLessThanOrEqual(48);
  });
});
