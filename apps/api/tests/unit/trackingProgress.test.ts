import { describe, it, expect } from "vitest";
import { ShipmentTrackingStatus as S } from "@gira/shared";
import { canAdvanceTracking } from "../../src/utils/trackingProgress.js";

const t0 = new Date("2026-10-19T10:00:00Z");
const t1 = new Date("2026-10-19T11:00:00Z");

describe("canAdvanceTracking", () => {
  it("avanza desde nada", () => {
    expect(canAdvanceTracking(undefined, { status: S.PICKED_UP, occurredAt: t0 })).toBe(true);
  });
  it("avanza hacia adelante y permite igual rango (in_transit <-> exception)", () => {
    expect(
      canAdvanceTracking(
        { status: S.PICKED_UP, lastEventAt: t0 },
        { status: S.IN_TRANSIT, occurredAt: t1 },
      ),
    ).toBe(true);
    expect(
      canAdvanceTracking(
        { status: S.IN_TRANSIT, lastEventAt: t0 },
        { status: S.EXCEPTION, occurredAt: t1 },
      ),
    ).toBe(true);
    expect(
      canAdvanceTracking(
        { status: S.EXCEPTION, lastEventAt: t0 },
        { status: S.IN_TRANSIT, occurredAt: t1 },
      ),
    ).toBe(true);
  });
  it("no retrocede", () => {
    expect(
      canAdvanceTracking(
        { status: S.OUT_FOR_DELIVERY, lastEventAt: t0 },
        { status: S.IN_TRANSIT, occurredAt: t1 },
      ),
    ).toBe(false);
  });
  it("no acepta un evento más viejo que el último", () => {
    expect(
      canAdvanceTracking(
        { status: S.IN_TRANSIT, lastEventAt: t1 },
        { status: S.OUT_FOR_DELIVERY, occurredAt: t0 },
      ),
    ).toBe(false);
  });
  it("un estado terminal no se mueve", () => {
    for (const s of [S.DELIVERED, S.RETURNED, S.LOST]) {
      expect(
        canAdvanceTracking({ status: s, lastEventAt: t0 }, { status: S.EXCEPTION, occurredAt: t1 }),
      ).toBe(false);
    }
  });
});
