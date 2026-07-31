import { ORDER_STATUS_LABELS, OrderStatus, SHIPMENT_STATUS_LABELS, ShipmentStatus } from "@gira/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusChip } from "@/components/ui/StatusChip";

describe("StatusChip", () => {
  it.each(Object.values(OrderStatus))(
    "renderiza el label en español y data-status para OrderStatus.%s",
    (status) => {
      render(<StatusChip status={status} />);
      const chip = screen.getByText(ORDER_STATUS_LABELS[status]);
      expect(chip).toHaveAttribute("data-status", status);
    },
  );

  it.each(Object.values(ShipmentStatus))(
    "renderiza el label en español y data-ship para ShipmentStatus.%s",
    (shipmentStatus) => {
      render(<StatusChip shipmentStatus={shipmentStatus} />);
      const chip = screen.getByText(SHIPMENT_STATUS_LABELS[shipmentStatus]);
      expect(chip).toHaveAttribute("data-ship", shipmentStatus);
    },
  );
});
