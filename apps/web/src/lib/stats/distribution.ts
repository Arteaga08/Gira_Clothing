import { ORDER_STATUS_LABELS, OrderStatus } from "@gira/shared";

interface DistributionSegment {
  status: OrderStatus;
  label: string;
  count: number;
  percent: number;
}

/**
 * `byStatus` is sparse (`Partial<Record<OrderStatus, number>>`, `{}` on an
 * empty DB) — iterating `Object.values(OrderStatus)` instead of the payload's
 * own keys means a status that never appears in this window is treated as 0,
 * not as absent from the enum.
 */
const distributionFrom = (
  byStatus: Partial<Record<OrderStatus, number>>,
): { segments: DistributionSegment[]; total: number } => {
  const total = Object.values(OrderStatus).reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);

  const segments = Object.values(OrderStatus)
    .map((status) => ({
      status,
      label: ORDER_STATUS_LABELS[status],
      count: byStatus[status] ?? 0,
      percent: total > 0 ? ((byStatus[status] ?? 0) / total) * 100 : 0,
    }))
    .filter((segment) => segment.count > 0)
    .sort((a, b) => b.count - a.count);

  return { segments, total };
};

export { distributionFrom };
export type { DistributionSegment };
