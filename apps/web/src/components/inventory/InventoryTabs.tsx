"use client";

import type { StockStatus } from "@gira/shared";
import { Tabs } from "@/components/ui/Tabs";
import type { InventoryCounts } from "@/lib/inventory/stats";

interface InventoryTabsProps {
  value: StockStatus | undefined;
  counts: InventoryCounts | null;
  onChange: (stock: StockStatus | undefined) => void;
}

const ALL = "all";

/** Agotado · Stock bajo · OK · Todos, with the counts of the stats endpoint (active variants only). */
const InventoryTabs = ({ value, counts, onChange }: InventoryTabsProps) => {
  const tab = (id: string, label: string, count: number | undefined) =>
    count === undefined ? { id, label } : { id, label, count };

  return (
    <Tabs
      tabs={[
        tab("out", "Agotado", counts?.out),
        tab("low", "Stock bajo", counts?.low),
        tab("ok", "OK", counts?.ok),
        tab(ALL, "Todos", counts?.total),
      ]}
      value={value ?? ALL}
      onChange={(id) => onChange(id === ALL ? undefined : (id as StockStatus))}
    />
  );
};

export type { InventoryTabsProps };
export { InventoryTabs };
