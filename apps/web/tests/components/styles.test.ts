import { OrderStatus } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { ORDER_STATUS_BG } from "@/components/ui/styles";

describe("styles: status colour maps", () => {
  it("ORDER_STATUS_BG tiene exactamente una entrada por OrderStatus, ni una de más", () => {
    expect(Object.keys(ORDER_STATUS_BG)).toHaveLength(Object.values(OrderStatus).length);
  });
});
