import { ShipmentTrackingStatus as S } from "@gira/shared";

/** Forward-only ladder. Equal rank may swap (in_transit <-> exception); rank 4 is terminal. */
const RANK: Record<S, number> = {
  [S.LABEL_CREATED]: 0,
  [S.PICKED_UP]: 1,
  [S.IN_TRANSIT]: 2,
  [S.EXCEPTION]: 2,
  [S.OUT_FOR_DELIVERY]: 3,
  [S.DELIVERED]: 4,
  [S.RETURNED]: 4,
  [S.LOST]: 4,
};

const TERMINAL_RANK = 4;

interface CurrentTracking {
  status: S;
  lastEventAt?: Date | undefined;
}

interface IncomingTracking {
  status: S;
  occurredAt: Date;
}

/** Whether an event may overwrite `order.tracking`. Out-of-order or replayed events must not roll it back. */
const canAdvanceTracking = (
  current: CurrentTracking | undefined,
  incoming: IncomingTracking,
): boolean => {
  if (!current) return true;
  if (RANK[current.status] >= TERMINAL_RANK) return false;
  if (RANK[incoming.status] < RANK[current.status]) return false;
  if (current.lastEventAt && incoming.occurredAt.getTime() < current.lastEventAt.getTime())
    return false;
  return true;
};

export type { CurrentTracking, IncomingTracking };
export { canAdvanceTracking, RANK };
