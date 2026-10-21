import { describe, expect, it } from "vitest";
import { categoryConfig, familyConfig } from "@/lib/taxonomy/config";

const ID = "68f2ab12c3d4e5f6a7b8c9e1";

describe("taxonomy config", () => {
  it("las familias enlazan a Estampas", () => {
    expect(familyConfig.childHref(ID)).toBe(`/estampas?estampa=${ID}`);
    expect(familyConfig.childrenHref(ID)).toBe(`/estampas?familia=${ID}`);
  });

  it("las categorías enlazan a Productos", () => {
    expect(categoryConfig.childHref(ID)).toBe(`/productos/${ID}`);
    expect(categoryConfig.childrenHref(ID)).toBe(`/productos?categoria=${ID}`);
  });

  it("un id manipulado falla antes de armar el enlace", () => {
    expect(() => familyConfig.childHref("../x")).toThrow();
    expect(() => categoryConfig.childrenHref("../x")).toThrow();
  });
});
