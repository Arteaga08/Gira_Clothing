import { describe, expect, it } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { assertPrintId } from "@/lib/prints/printId";

describe("assertPrintId", () => {
  it("deja pasar un ObjectId", () => {
    expect(assertPrintId("68f2ab12c3d4e5f6a7b8c9e2")).toBe("68f2ab12c3d4e5f6a7b8c9e2");
  });

  it("rechaza cualquier otra cosa antes de armar la ruta", () => {
    expect.assertions(2);
    try {
      assertPrintId("../admin");
    } catch (failure) {
      expect(isApiError(failure)).toBe(true);
      expect((failure as Error).message).toBe("El identificador de la estampa no es válido.");
    }
  });
});
