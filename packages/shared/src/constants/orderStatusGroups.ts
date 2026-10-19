import { OrderStatus } from "../enums/orderStatus.js";

type OrderStatusGroup = "action" | "waiting" | "shipping" | "problems";

/**
 * Operator buckets (DASHBOARD §10.A). The mapping is exhaustive over OrderStatus:
 * a new status without a bucket breaks the typecheck instead of vanishing from
 * the KPI cards.
 */
const ORDER_STATUS_TO_GROUP = {
  [OrderStatus.PAID]: "action",
  [OrderStatus.PROCESSING]: "action",
  [OrderStatus.PENDING_PAYMENT]: "waiting",
  [OrderStatus.SHIPPED]: "shipping",
  [OrderStatus.DELIVERED]: "shipping",
  [OrderStatus.CANCELLED]: "problems",
  [OrderStatus.EXPIRED]: "problems",
  [OrderStatus.REFUNDED]: "problems",
} as const satisfies Record<OrderStatus, OrderStatusGroup>;

const GROUP_KEYS: readonly OrderStatusGroup[] = ["action", "waiting", "shipping", "problems"];

const statusesOf = (group: OrderStatusGroup): readonly OrderStatus[] =>
  (Object.keys(ORDER_STATUS_TO_GROUP) as OrderStatus[]).filter(
    (status) => ORDER_STATUS_TO_GROUP[status] === group,
  );

const ORDER_STATUS_GROUPS: Readonly<Record<OrderStatusGroup, readonly OrderStatus[]>> = Object.freeze({
  action: statusesOf("action"),
  waiting: statusesOf("waiting"),
  shipping: statusesOf("shipping"),
  problems: statusesOf("problems"),
});

/** Filter value (CSV of statuses) -> the bucket it matches exactly, if any. */
const matchStatusGroup = (csv: string): OrderStatusGroup | null => {
  const parts = new Set(csv.split(",").filter(Boolean));
  if (parts.size === 0) return null;
  for (const group of GROUP_KEYS) {
    const statuses = ORDER_STATUS_GROUPS[group];
    if (parts.size === statuses.length && statuses.every((s) => parts.has(s))) return group;
  }
  return null;
};

export type { OrderStatusGroup };
export { ORDER_STATUS_TO_GROUP, ORDER_STATUS_GROUPS, matchStatusGroup };
