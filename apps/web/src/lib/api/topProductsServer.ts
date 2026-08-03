import type { PeriodPreset, TopProductsPeriod, Wire } from "@gira/shared";
import { expectData } from "./request";
import { serverRequest } from "./server";
import { STATS_TOP_PRODUCTS_PATH } from "./paths";

/**
 * Server-only. Feeds the initial paint of `TopProductsSection` (`period=week`
 * by default) so there's no empty-state flash before the client widget takes
 * over — every subsequent period change refetches from `topProducts.ts`
 * (browser) instead, since `<input type="date">` interaction shouldn't force
 * a full page navigation.
 */
const getTopProductsForPeriod = async (
  period: PeriodPreset,
  fecha?: string,
): Promise<Wire<TopProductsPeriod>> => {
  const query = fecha ? `period=${period}&fecha=${fecha}` : `period=${period}`;
  return expectData(await serverRequest<TopProductsPeriod>(`${STATS_TOP_PRODUCTS_PATH}?${query}`));
};

export { getTopProductsForPeriod };
