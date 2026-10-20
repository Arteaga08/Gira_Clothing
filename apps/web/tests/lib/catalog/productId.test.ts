import { describe, expect, it } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { assertProductId, isProductId, productPath } from "@/lib/catalog/productId";

const ID = "68f2ab12c3d4e5f6a7b8c9e2";

describe("productId", () => {
  it("acepta un ObjectId de 24 hex", () => {
    expect(isProductId(ID)).toBe(true);
    expect(assertProductId(ID)).toBe(ID);
    expect(productPath(ID)).toBe(`/productos/${ID}`);
  });

  it("rechaza algo que no es un id antes de armar una ruta", () => {
    for (const bad of ["", "abc", "../etc/passwd", `${ID}/x`]) {
      expect(isProductId(bad)).toBe(false);
      try {
        assertProductId(bad);
        throw new Error("no lanzó");
      } catch (failure) {
        expect(isApiError(failure) && failure.kind).toBe("parse");
      }
    }
  });
});
