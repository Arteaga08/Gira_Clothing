import type { OrderStatsAlerts, OutboxHealth, Wire } from "@gira/shared";

type AttentionLevel = "warn" | "danger" | "clear";

interface AttentionTile {
  key: string;
  label: string;
  count: number;
  level: AttentionLevel;
}

/**
 * The band is range-independent by design (same reasoning as
 * orderStatsService.ts's `alerts`): a stuck order isn't less stuck because
 * the admin is looking at a different `?dias=`.
 *
 * When a section's fetch failed, its tiles are OMITTED, never rendered at
 * zero — an invented zero on top of a downed endpoint would misreport a
 * clear queue.
 */
const alertTilesFrom = (alerts: OrderStatsAlerts): AttentionTile[] => [
  {
    key: "awaitingPreparation",
    label: "Pagadas sin preparar (+24 h)",
    count: alerts.awaitingPreparation,
    level: alerts.awaitingPreparation > 0 ? "warn" : "clear",
  },
  {
    key: "stuckInProcessing",
    label: "Atoradas en preparación (+72 h)",
    count: alerts.stuckInProcessing,
    level: alerts.stuckInProcessing > 0 ? "danger" : "clear",
  },
  {
    key: "inTransitTooLong",
    label: "En tránsito demasiado tiempo (+14 d)",
    count: alerts.inTransitTooLong,
    level: alerts.inTransitTooLong > 0 ? "warn" : "clear",
  },
  {
    key: "disputed",
    label: "En disputa",
    count: alerts.disputed,
    level: alerts.disputed > 0 ? "danger" : "clear",
  },
  {
    // Always clear: this is the normal flow, not a problem. Painting it amber
    // would train the admin to ignore the band.
    key: "pendingPayment",
    label: "Pendientes de pago (flujo normal)",
    count: alerts.pendingPayment,
    level: "clear",
  },
];

const attentionTilesFrom = (
  alerts: OrderStatsAlerts | undefined,
  health: Wire<OutboxHealth> | undefined,
): AttentionTile[] => {
  const tiles: AttentionTile[] = [];
  if (alerts) tiles.push(...alertTilesFrom(alerts));
  if (health) {
    tiles.push({
      key: "failedNotifications",
      label: "Notificaciones fallidas",
      count: health.failed,
      level: health.failed > 0 ? "danger" : "clear",
    });
  }
  return tiles;
};

export { attentionTilesFrom };
export type { AttentionLevel, AttentionTile };
