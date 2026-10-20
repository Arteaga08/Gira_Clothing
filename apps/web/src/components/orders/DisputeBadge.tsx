import { DisputeStatus, DISPUTE_STATUS_LABELS } from "@gira/shared";
import { Badge } from "@/components/ui/Badge";

/** Only an open or lost dispute blocks shipping, so only those two are drawn. */
const DisputeBadge = ({ status }: { status: DisputeStatus | undefined }) => {
  if (status !== DisputeStatus.OPEN && status !== DisputeStatus.LOST) return null;
  return (
    <Badge variant="danger" data-dispute={status}>
      Disputa {DISPUTE_STATUS_LABELS[status]}
    </Badge>
  );
};

export { DisputeBadge };
