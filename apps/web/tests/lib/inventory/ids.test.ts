import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { assertVariantId, isObjectId, isVariantId } from "@/lib/inventory/variantId";

describe("variantId", () => {
  it("acepta 24 caracteres hexadecimales", () => {
    expect(isObjectId("68f2ab12c3d4e5f6a7b8c9d0")).toBe(true);
    expect(isVariantId("68F2AB12C3D4E5F6A7B8C9D0")).toBe(true);
  });

  it("rechaza todo lo demás, incluido lo que armaría otra ruta", () => {
    for (const bad of ["", "abc", "../orders", "68f2ab12c3d4e5f6a7b8c9d0/stock", "68f2ab12c3d4e5f6a7b8c9dg", "68f2ab12c3d4e5f6a7b8c9d00"]) {
      expect(isVariantId(bad)).toBe(false);
    }
  });

  it("assertVariantId devuelve el id o lanza ApiError de parseo antes de cualquier request", () => {
    expect(assertVariantId("68f2ab12c3d4e5f6a7b8c9d0")).toBe("68f2ab12c3d4e5f6a7b8c9d0");
    expect(() => assertVariantId("../x")).toThrow(ApiError);
  });
});
