import { ShippingLabelStatus, SHIPPING_LABEL_STATUS_LABELS } from "@gira/shared";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

/** Exhaustive: a new label status without a variant fails the typecheck. */
const LABEL_VARIANTS: Record<ShippingLabelStatus, BadgeVariant> = {
  [ShippingLabelStatus.PENDING]: "neutral",
  [ShippingLabelStatus.REQUESTED]: "neutral",
  [ShippingLabelStatus.READY]: "ok",
  [ShippingLabelStatus.FAILED]: "warn",
  [ShippingLabelStatus.NEEDS_REVIEW]: "danger",
  [ShippingLabelStatus.CANCEL_PENDING]: "neutral",
  [ShippingLabelStatus.CANCELLED]: "neutral",
};

const LabelStatusChip = ({ status }: { status: ShippingLabelStatus }) => (
  <Badge variant={LABEL_VARIANTS[status]} data-label-status={status}>
    {SHIPPING_LABEL_STATUS_LABELS[status]}
  </Badge>
);

export { LabelStatusChip };
