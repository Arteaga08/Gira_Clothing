import type { AccountResponse, Wire } from "@gira/shared";

/** One-line summaries the phone tiles of the summary show, from the account read. */

const plural = (count: number, one: string, many: string): string => `${String(count)} ${count === 1 ? one : many}`;

const addressesSummary = (count: number): string => (count === 0 ? "Sin agregar" : plural(count, "dirección", "direcciones"));
const billingSummary = (billing: Wire<AccountResponse>["billing"]): string => (billing ? billing.rfc : "Sin agregar");
const savedSummary = (count: number): string => (count === 0 ? "Sin guardados" : plural(count, "prenda", "prendas"));

export { addressesSummary, billingSummary, savedSummary };
