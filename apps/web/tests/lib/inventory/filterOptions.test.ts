import { describe, expect, it } from "vitest";
import { modelsForCategory, toFilterOptions } from "@/lib/inventory/filterOptions";

const category = (id: string, name: string) => ({ id, name, slug: name, color: "bone" as const, isActive: true });
const product = (id: string, name: string, categoryId: string) =>
  ({ id, name, slug: name, category: { id: categoryId, name: "x", slug: "x" }, isActive: true }) as never;
const print = (id: string, name: string) => ({ id, name, slug: name, sku: name, isActive: true }) as never;

describe("toFilterOptions", () => {
  const options = toFilterOptions(
    [category("c2", "Playeras"), category("c1", "Hoodies")],
    [product("p2", "Zip", "c1"), product("p1", "Boxy", "c2")],
    [print("r2", "Lava"), print("r1", "Bruma")],
  );

  it("ordena cada lista por nombre en español", () => {
    expect(options.categories.map((option) => option.label)).toEqual(["Hoodies", "Playeras"]);
    expect(options.models.map((option) => option.label)).toEqual(["Boxy", "Zip"]);
    expect(options.prints.map((option) => option.label)).toEqual(["Bruma", "Lava"]);
  });

  it("el value es el id y los modelos recuerdan su categoría", () => {
    expect(options.categories[0]).toEqual({ value: "c1", label: "Hoodies" });
    expect(options.models[0]).toEqual({ value: "p1", label: "Boxy", categoryId: "c2" });
  });
});

describe("modelsForCategory", () => {
  const models = [
    { value: "p1", label: "A", categoryId: "c1" },
    { value: "p2", label: "B", categoryId: "c2" },
  ];

  it("sin categoría devuelve todos", () => {
    expect(modelsForCategory(models, undefined)).toHaveLength(2);
  });

  it("con categoría deja solo los suyos", () => {
    expect(modelsForCategory(models, "c2").map((model) => model.value)).toEqual(["p2"]);
  });
});
