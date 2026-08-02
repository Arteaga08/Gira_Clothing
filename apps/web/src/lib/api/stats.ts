import type { Overview, OutboxHealth, TimeseriesStats, Wire } from "@gira/shared";
import { expectData } from "./request";
import { serverRequest } from "./server";
import { OUTBOX_HEALTH_PATH, STATS_OVERVIEW_PATH, STATS_TIMESERIES_PATH } from "./paths";

/**
 * Server-only fetches for the Resumen screen. `serverRequest` is GET-only by
 * type, which is exactly what these three endpoints are — there is no
 * mutation to guard against here, only the cookie-forwarding and
 * `cache: "no-store"` that every admin read needs.
 *
 * Every stats/health endpoint spreads its DTO directly into `data` (no named
 * wrapper key, unlike the CRUD admin endpoints) — confirmed against
 * apps/api/tests/integration/{statsOverview,statsTimeseries,notificationsHealth}.test.ts.
 */

const getOverview = async (days: number): Promise<Wire<Overview>> =>
  expectData(await serverRequest<Overview>(`${STATS_OVERVIEW_PATH}?days=${days}`));

const getTimeseries = async (days: number): Promise<Wire<TimeseriesStats>> =>
  expectData(await serverRequest<TimeseriesStats>(`${STATS_TIMESERIES_PATH}?days=${days}`));

/** No query params — the endpoint doesn't accept any (see notificationRoutes.ts). */
const getOutboxHealth = async (): Promise<Wire<OutboxHealth>> =>
  expectData(await serverRequest<OutboxHealth>(OUTBOX_HEALTH_PATH));

export { getOverview, getTimeseries, getOutboxHealth };
