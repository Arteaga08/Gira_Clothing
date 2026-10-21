/** Calendar windows of the "Mejores clientes" ranking (hoy / semana / mes). */
const CUSTOMER_RANK_PERIODS = ["today", "week", "month"] as const;
/** What the ranking is ordered by; the other metric breaks ties. */
const CUSTOMER_RANK_SORTS = ["spent", "orders"] as const;
const CUSTOMER_RANK_LIMIT = 10;

type CustomerRankPeriod = (typeof CUSTOMER_RANK_PERIODS)[number];
type CustomerRankSort = (typeof CUSTOMER_RANK_SORTS)[number];

export type { CustomerRankPeriod, CustomerRankSort };
export { CUSTOMER_RANK_PERIODS, CUSTOMER_RANK_SORTS, CUSTOMER_RANK_LIMIT };
