import { describe, expect, it } from "vitest";
import { groupByCategory } from "@/lib/inventory/groupByCategory";
import type { PanelVariant } from "@/lib/inventory/panelVariant";
import { toPanelVariant } from "@/lib/inventory/panelVariant";
import { makeRawVariant } from "../../helpers/inventory";

const row = (id: string, sku: string, categoryId: string, categoryName: string, available: number): PanelVariant => {
  const raw = makeRawVariant({ id, sku, onHand: available, reserved: 0, available });
  return toPanelVariant({ ...raw, product: { ...raw.product, category: { ...raw.product.category, id: categoryId, name: categoryName } } });
};

const THRESHOLD = 3;

describe("groupByCategory", () => {
  it("sin filas no hay grupos", () => {
    expect(groupByCategory([], THRESHOLD)).toEqual([]);
  });

  it("agrupa por categoría y ordena los grupos por nombre", () => {
    const groups = groupByCategory(
      [row("1", "A", "c2", "Playeras", 5), row("2", "B", "c1", "Hoodies", 5), row("3", "C", "c2", "Playeras", 9)],
      THRESHOLD,
    );
    expect(groups.map((group) => group.name)).toEqual(["Hoodies", "Playeras"]);
    expect(groups[1]?.variants.map((variant) => variant.sku)).toEqual(["A", "C"]);
  });

  it("dentro de cada grupo lo urgente va arriba (disponible ascendente, SKU como desempate)", () => {
    const [group] = groupByCategory(
      [row("1", "Z", "c1", "H", 7), row("2", "B", "c1", "H", 0), row("3", "A", "c1", "H", 0), row("4", "M", "c1", "H", -2)],
      THRESHOLD,
    );
    expect(group?.variants.map((variant) => variant.sku)).toEqual(["M", "A", "B", "Z"]);
  });

  it("cuenta agotados, bajos y ok con el umbral recibido y suma el disponible", () => {
    const [group] = groupByCategory(
      [row("1", "A", "c1", "H", 0), row("2", "B", "c1", "H", 3), row("3", "C", "c1", "H", 4), row("4", "D", "c1", "H", -1)],
      THRESHOLD,
    );
    expect(group).toMatchObject({ total: 4, counts: { out: 2, low: 1, ok: 1 }, available: 7 });
  });

  it("el disponible total no resta los negativos como si fueran stock", () => {
    const [group] = groupByCategory([row("1", "A", "c1", "H", -5), row("2", "B", "c1", "H", 4)], THRESHOLD);
    expect(group?.available).toBe(4);
  });

  it("con umbral 0 nada es bajo", () => {
    const [group] = groupByCategory([row("1", "A", "c1", "H", 0), row("2", "B", "c1", "H", 1)], 0);
    expect(group?.counts).toEqual({ out: 1, low: 0, ok: 1 });
  });

  it("no muta la lista recibida", () => {
    const input = [row("1", "B", "c1", "H", 9), row("2", "A", "c1", "H", 1)];
    const copy = [...input];
    groupByCategory(input, THRESHOLD);
    expect(input).toEqual(copy);
  });
});
