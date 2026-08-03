import type { PeriodPreset, TopProductsPeriod, Wire } from "@gira/shared";
import { expectData } from "./request";
import { browserRequest } from "./browser";
import { STATS_TOP_PRODUCTS_PATH } from "./paths";

/**
 * Browser-only. `TopProductsSection` refetches this on every change of its
 * period selector (Hoy/Semana/Mes/fecha específica) — cannot import
 * `topProductsServer.ts`, which pulls in `next/headers` and would break the
 * client bundle.
 */
const fetchTopProductsForPeriod = async (
  period: PeriodPreset,
  fecha?: string,
): Promise<Wire<TopProductsPeriod>> => {
  const query = fecha ? `period=${period}&fecha=${fecha}` : `period=${period}`;
  return expectData(await browserRequest<TopProductsPeriod>(`${STATS_TOP_PRODUCTS_PATH}?${query}`));
};

export { fetchTopProductsForPeriod };
