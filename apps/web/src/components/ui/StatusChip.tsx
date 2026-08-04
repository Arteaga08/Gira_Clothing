import type { OrderStatus, ShipmentStatus } from "@gira/shared";
import { ORDER_STATUS_LABELS, SHIPMENT_STATUS_LABELS } from "@gira/shared";
import { cn } from "@/lib/cn";
import { BADGE_BASE } from "./Badge";
import { ORDER_STATUS_BG, SHIPMENT_STATUS_BG } from "./styles";

type StatusChipProps =
  | { status: OrderStatus; className?: string }
  | { shipmentStatus: ShipmentStatus; className?: string };

/**
 * Labels come from @gira/shared — never a local map — so the panel's Spanish
 * text can never drift from what the API already returns in its own error
 * messages. `data-status`/`data-ship` carry the raw enum value, so a test (or
 * a human in DevTools) can read the underlying status without decoding the
 * Spanish label back.
 */
const StatusChip = (props: StatusChipProps) => {
  if ("status" in props) {
    return (
      <span
        data-status={props.status}
        className={cn(BADGE_BASE, ORDER_STATUS_BG[props.status], props.className)}
      >
        {ORDER_STATUS_LABELS[props.status]}
      </span>
    );
  }

  return (
    <span
      data-ship={props.shipmentStatus}
      className={cn(BADGE_BASE, SHIPMENT_STATUS_BG[props.shipmentStatus], props.className)}
    >
      {SHIPMENT_STATUS_LABELS[props.shipmentStatus]}
    </span>
  );
};

export type { StatusChipProps };
export { StatusChip };
