import { OrderPriority, ORDER_PRIORITY_LABELS } from "@gira/shared";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

/** `normal` is the default and draws nothing: only a priority that changes the queue gets a badge. */
const PriorityBadge = ({ priority }: { priority: OrderPriority }) => {
  if (priority === OrderPriority.NORMAL) return null;
  const urgent = priority === OrderPriority.URGENT;
  return (
    <Badge variant={urgent ? "danger" : "warn"} data-priority={priority}>
      {urgent ? <Icon icon={WarningIcon} size={12} /> : null}
      {ORDER_PRIORITY_LABELS[priority]}
    </Badge>
  );
};

export { PriorityBadge };
