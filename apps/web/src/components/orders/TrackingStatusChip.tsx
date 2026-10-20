import { ShipmentTrackingStatus, SHIPMENT_TRACKING_STATUS_LABELS } from "@gira/shared";
import { BADGE_BASE } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

/** Exhaustive: a new tracking status without a background fails the typecheck. */
const TRACKING_BG: Record<ShipmentTrackingStatus, string> = {
  [ShipmentTrackingStatus.LABEL_CREATED]: "bg-[var(--ship-label_created)]",
  [ShipmentTrackingStatus.PICKED_UP]: "bg-[var(--ship-picked_up)]",
  [ShipmentTrackingStatus.IN_TRANSIT]: "bg-[var(--ship-in_transit)]",
  [ShipmentTrackingStatus.OUT_FOR_DELIVERY]: "bg-[var(--ship-out_for_delivery)]",
  [ShipmentTrackingStatus.DELIVERED]: "bg-[var(--ship-delivered)]",
  [ShipmentTrackingStatus.EXCEPTION]: "bg-[var(--ship-exception)]",
  [ShipmentTrackingStatus.RETURNED]: "bg-[var(--ship-returned)]",
  [ShipmentTrackingStatus.LOST]: "bg-[var(--ship-lost)]",
};

const TrackingStatusChip = ({ status, className }: { status: ShipmentTrackingStatus; className?: string }) => (
  <span data-tracking-status={status} className={cn(BADGE_BASE, TRACKING_BG[status], className)}>
    {SHIPMENT_TRACKING_STATUS_LABELS[status]}
  </span>
);

export { TrackingStatusChip };
