import { describe, expect, it } from "vitest";
import { attentionTilesFrom } from "@/lib/stats/attention";

const alerts = {
  awaitingPreparation: 0,
  stuckInProcessing: 0,
  inTransitTooLong: 0,
  disputed: 0,
  pendingPayment: 0,
};

const health = {
  pending: 0,
  sending: 0,
  failed: 0,
  sent: 0,
  stale: 0,
  oldestPendingAt: null,
  failedSample: [],
};

describe("attentionTilesFrom", () => {
  it("todo en 0 y sin fallas -> las 6 tiles en clear", () => {
    const tiles = attentionTilesFrom(alerts, health);
    expect(tiles).toHaveLength(6);
    expect(tiles.every((tile) => tile.level === "clear")).toBe(true);
  });

  it("pendingPayment > 0 sigue siendo clear (es el flujo normal)", () => {
    const tiles = attentionTilesFrom({ ...alerts, pendingPayment: 5 }, health);
    expect(tiles.find((tile) => tile.key === "pendingPayment")!.level).toBe("clear");
  });

  it("awaitingPreparation > 0 es warn", () => {
    const tiles = attentionTilesFrom({ ...alerts, awaitingPreparation: 3 }, health);
    expect(tiles.find((tile) => tile.key === "awaitingPreparation")!.level).toBe("warn");
  });

  it("stuckInProcessing y disputed > 0 son danger", () => {
    const tiles = attentionTilesFrom({ ...alerts, stuckInProcessing: 2, disputed: 1 }, health);
    expect(tiles.find((tile) => tile.key === "stuckInProcessing")!.level).toBe("danger");
    expect(tiles.find((tile) => tile.key === "disputed")!.level).toBe("danger");
  });

  it("inTransitTooLong > 0 es warn", () => {
    const tiles = attentionTilesFrom({ ...alerts, inTransitTooLong: 1 }, health);
    expect(tiles.find((tile) => tile.key === "inTransitTooLong")!.level).toBe("warn");
  });

  it("failed > 0 en health es danger en la tile de notificaciones", () => {
    const tiles = attentionTilesFrom(alerts, { ...health, failed: 1 });
    const tile = tiles.find((tile) => tile.key === "failedNotifications")!;
    expect(tile.level).toBe("danger");
    expect(tile.count).toBe(1);
  });

  it("alerts undefined (falló su fetch) -> ninguna de las 5 tiles de alerts, la de notificaciones sigue", () => {
    const tiles = attentionTilesFrom(undefined, health);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.key).toBe("failedNotifications");
  });

  it("health undefined (falló su fetch) -> 5 tiles, sin la de notificaciones", () => {
    const tiles = attentionTilesFrom(alerts, undefined);
    expect(tiles).toHaveLength(5);
    expect(tiles.find((tile) => tile.key === "failedNotifications")).toBeUndefined();
  });

  it("ambos undefined -> sin tiles", () => {
    expect(attentionTilesFrom(undefined, undefined)).toHaveLength(0);
  });
});
