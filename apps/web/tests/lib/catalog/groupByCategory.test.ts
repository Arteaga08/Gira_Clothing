import { describe, expect, it } from "vitest";
import { groupProductsByCategory } from "@/lib/catalog/groupByCategory";
import { toPanelProduct } from "@/lib/catalog/panelProduct";
import { makeRawProduct } from "../../helpers/catalog";

const product = (id: string, name: string, categoryId: string, categoryName: string) =>
  toPanelProduct(
    makeRawProduct({ id, name, category: { id: categoryId, name: categoryName, slug: "x" } }),
  );

describe("groupProductsByCategory", () => {
  it("agrupa por categoría en el orden en que aparecen, conservando el orden de los modelos", () => {
    const groups = groupProductsByCategory([
      product("1", "Chica", "c1", "Cosmetiquera"),
      product("2", "Grande", "c1", "Cosmetiquera"),
      product("3", "Oversize", "c2", "Playeras"),
    ]);
    expect(groups.map((group) => [group.name, group.products.map((p) => p.name)])).toEqual([
      ["Cosmetiquera", ["Chica", "Grande"]],
      ["Playeras", ["Oversize"]],
    ]);
  });

  it("sin modelos no hay grupos", () => {
    expect(groupProductsByCategory([])).toEqual([]);
  });
});
