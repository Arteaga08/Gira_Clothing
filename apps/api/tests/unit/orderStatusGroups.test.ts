import { describe, it, expect } from "vitest";
import {
  OrderStatus,
  ORDER_STATUS_GROUPS,
  ORDER_STATUS_TO_GROUP,
  matchStatusGroup,
  ORDER_NUMBER_PATTERN,
} from "@gira/shared";

describe("grupos de estado", () => {
  it("cada estado pertenece a exactamente un grupo", () => {
    const seen = new Map<string, string>();
    for (const [group, statuses] of Object.entries(ORDER_STATUS_GROUPS)) {
      for (const s of statuses) {
        expect(seen.has(s), `${s} repetido`).toBe(false);
        seen.set(s, group);
      }
    }
    expect([...seen.keys()].sort()).toEqual(Object.values(OrderStatus).sort());
  });

  it("ORDER_STATUS_TO_GROUP coincide con ORDER_STATUS_GROUPS", () => {
    expect(ORDER_STATUS_TO_GROUP[OrderStatus.PAID]).toBe("action");
    expect(ORDER_STATUS_TO_GROUP[OrderStatus.PENDING_PAYMENT]).toBe("waiting");
    expect(ORDER_STATUS_TO_GROUP[OrderStatus.DELIVERED]).toBe("shipping");
    expect(ORDER_STATUS_TO_GROUP[OrderStatus.EXPIRED]).toBe("problems");
  });

  it("matchStatusGroup empata solo con el conjunto exacto, sin importar el orden", () => {
    expect(matchStatusGroup("processing,paid")).toBe("action");
    expect(matchStatusGroup("paid")).toBeNull();
    expect(matchStatusGroup("")).toBeNull();
    expect(matchStatusGroup("paid,processing,shipped")).toBeNull();
  });

  it("ORDER_NUMBER_PATTERN acepta el folio y rechaza I/O/0/1", () => {
    expect(ORDER_NUMBER_PATTERN.test("GC-7KQ2M9XA")).toBe(true);
    expect(ORDER_NUMBER_PATTERN.test("GC-7KQ2M9X0")).toBe(false);
    expect(ORDER_NUMBER_PATTERN.test("GC-7KQ2M9XI")).toBe(false);
    expect(ORDER_NUMBER_PATTERN.test("GC-7KQ2M9")).toBe(false);
  });
});
