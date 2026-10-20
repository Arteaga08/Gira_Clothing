import {
  OrderStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_GROUPS,
  ORDER_STATUS_GROUP_LABELS,
  ORDER_PRIORITY_LABELS,
  matchStatusGroup,
} from "@gira/shared";

type OrderTabId =
  | OrderStatus.PENDING_PAYMENT
  | OrderStatus.PAID
  | OrderStatus.PROCESSING
  | OrderStatus.SHIPPED
  | OrderStatus.DELIVERED
  | "all";

interface OrderTabConfig {
  id: OrderTabId;
  label: string;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const statusTab = (status: Exclude<OrderTabId, "all">): OrderTabConfig => ({
  id: status,
  label: capitalize(ORDER_STATUS_LABELS[status]),
});

/** One status per tab; "Todos" is the only way to reach cancelled, expired and refunded orders. */
const ORDER_TABS: readonly OrderTabConfig[] = [
  statusTab(OrderStatus.PENDING_PAYMENT),
  statusTab(OrderStatus.PAID),
  statusTab(OrderStatus.PROCESSING),
  statusTab(OrderStatus.SHIPPED),
  statusTab(OrderStatus.DELIVERED),
  { id: "all", label: "Todos" },
];

/** Mirror of ADMIN_ALLOWED in the API: shipped and delivered never come from a manual change. */
const MANUAL_TRANSITIONS: Readonly<Partial<Record<OrderStatus, readonly OrderStatus[]>>> = {
  [OrderStatus.PAID]: [OrderStatus.PROCESSING],
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.CANCELLED],
};

const isManualTransitionAllowed = (from: OrderStatus, to: OrderStatus): boolean =>
  MANUAL_TRANSITIONS[from]?.includes(to) ?? false;

const EDITABLE_ADDRESS_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
];

const canEditShippingAddress = (status: OrderStatus): boolean => EDITABLE_ADDRESS_STATUSES.includes(status);

export {
  ORDER_TABS,
  isManualTransitionAllowed,
  canEditShippingAddress,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_GROUPS,
  ORDER_STATUS_GROUP_LABELS,
  ORDER_PRIORITY_LABELS,
  matchStatusGroup,
};
export type { OrderTabId, OrderTabConfig };
