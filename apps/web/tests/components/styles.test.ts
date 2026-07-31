import { OrderStatus, ShipmentStatus } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { ORDER_STATUS_BG, SHIPMENT_STATUS_BG } from "@/components/ui/styles";

describe("styles: status colour maps", () => {
  it("ORDER_STATUS_BG tiene exactamente una entrada por OrderStatus, ni una de más", () => {
    expect(Object.keys(ORDER_STATUS_BG)).toHaveLength(Object.values(OrderStatus).length);
  });

  it("SHIPMENT_STATUS_BG tiene exactamente una entrada por ShipmentStatus, ni una de más", () => {
    expect(Object.keys(SHIPMENT_STATUS_BG)).toHaveLength(Object.values(ShipmentStatus).length);
  });
});
