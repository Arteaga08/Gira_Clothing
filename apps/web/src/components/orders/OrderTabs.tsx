"use client";

import type { OrderStatus } from "@gira/shared";
import { Tabs } from "@/components/ui/Tabs";
import { ORDER_TABS, type OrderTabId } from "@/lib/orders/status";

interface OrderTabsProps {
  value: OrderTabId;
  counts: Record<OrderStatus, number> | null;
  onChange: (tab: OrderTabId) => void;
}

/** One tab per status, with its count from /summary. "Todos" has no count: it is every status at once. */
const OrderTabs = ({ value, counts, onChange }: OrderTabsProps) => {
  const tabs = ORDER_TABS.map((tab) => {
    const count = tab.id !== "all" && counts ? counts[tab.id] : undefined;
    return count === undefined ? { id: tab.id, label: tab.label } : { id: tab.id, label: tab.label, count };
  });
  return <Tabs tabs={tabs} value={value} onChange={(id) => onChange(id as OrderTabId)} />;
};

export type { OrderTabsProps };
export { OrderTabs };
