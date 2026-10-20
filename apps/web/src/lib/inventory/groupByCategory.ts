import { stockStatusOf } from "@gira/shared";
import type { PanelVariant } from "./panelVariant";

interface CategoryGroupData {
  id: string;
  name: string;
  /** Most urgent first: lowest available, then SKU. */
  variants: PanelVariant[];
  total: number;
  counts: { out: number; low: number; ok: number };
  /** Units a customer could buy today; a negative available never subtracts from it. */
  available: number;
}

const byUrgency = (a: PanelVariant, b: PanelVariant): number =>
  a.available - b.available || a.sku.localeCompare(b.sku, "es");

/** Groups the rows of the current page by product category. The input is not mutated. */
const groupByCategory = (rows: readonly PanelVariant[], threshold: number): CategoryGroupData[] => {
  const groups = new Map<string, CategoryGroupData>();

  for (const row of rows) {
    const { id, name } = row.product.category;
    const group = groups.get(id) ?? {
      id,
      name,
      variants: [],
      total: 0,
      counts: { out: 0, low: 0, ok: 0 },
      available: 0,
    };
    group.variants.push(row);
    group.total += 1;
    group.counts[stockStatusOf(row.available, threshold)] += 1;
    group.available += Math.max(0, row.available);
    groups.set(id, group);
  }

  return [...groups.values()]
    .map((group) => ({ ...group, variants: [...group.variants].sort(byUrgency) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
};

export { groupByCategory };
export type { CategoryGroupData };
