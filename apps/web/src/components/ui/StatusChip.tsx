import type { OrderStatus } from "@gira/shared";
import { ORDER_STATUS_LABELS } from "@gira/shared";
import { cn } from "@/lib/cn";
import { BADGE_BASE } from "./Badge";
import { ORDER_STATUS_BG } from "./styles";

type StatusChipProps = { status: OrderStatus; className?: string };

/**
 * Labels come from @gira/shared — never a local map — so the panel's Spanish
 * text can never drift from what the API already returns in its own error
 * messages. `data-status` carries the raw enum value, so a test (or a human
 * in DevTools) can read the underlying status without decoding the Spanish
 * label back.
 */
const StatusChip = ({ status, className }: StatusChipProps) => (
  <span data-status={status} className={cn(BADGE_BASE, ORDER_STATUS_BG[status], className)}>
    {ORDER_STATUS_LABELS[status]}
  </span>
);

export type { StatusChipProps };
export { StatusChip };
