import {
  DisputeStatus,
  OrderPriority,
  ShipmentTrackingStatus,
  ShippingLabelStatus,
  SHIPMENT_TRACKING_STATUS_LABELS,
  SHIPPING_LABEL_STATUS_LABELS,
} from "@gira/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DisputeBadge } from "@/components/orders/DisputeBadge";
import { LabelStatusChip } from "@/components/orders/LabelStatusChip";
import { PriorityBadge } from "@/components/orders/PriorityBadge";
import { TrackingStatusChip } from "@/components/orders/TrackingStatusChip";

describe("PriorityBadge", () => {
  it("normal no dibuja nada", () => {
    const { container } = render(<PriorityBadge priority={OrderPriority.NORMAL} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([OrderPriority.HIGH, OrderPriority.URGENT])("%s se dibuja con su texto", (priority) => {
    render(<PriorityBadge priority={priority} />);
    expect(screen.getByText(priority)).toHaveAttribute("data-priority", priority);
  });
});

describe("DisputeBadge", () => {
  it.each([DisputeStatus.OPEN, DisputeStatus.LOST])("%s se muestra", (status) => {
    render(<DisputeBadge status={status} />);
    expect(screen.getByText(/disputa/i)).toHaveAttribute("data-dispute", status);
  });

  it.each([DisputeStatus.WON, DisputeStatus.WITHDRAWN, undefined])("%s no se muestra", (status) => {
    const { container } = render(<DisputeBadge status={status} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LabelStatusChip", () => {
  it.each(Object.values(ShippingLabelStatus))("%s usa el texto de shared", (status) => {
    render(<LabelStatusChip status={status} />);
    expect(screen.getByText(SHIPPING_LABEL_STATUS_LABELS[status])).toHaveAttribute("data-label-status", status);
  });
});

describe("TrackingStatusChip", () => {
  it.each(Object.values(ShipmentTrackingStatus))("%s usa el texto de shared y su fondo --ship-*", (status) => {
    render(<TrackingStatusChip status={status} />);
    const chip = screen.getByText(SHIPMENT_TRACKING_STATUS_LABELS[status]);
    expect(chip).toHaveAttribute("data-tracking-status", status);
    expect(chip.className).toContain(`--ship-${status}`);
  });
});
