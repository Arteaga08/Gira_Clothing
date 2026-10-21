import { describe, it, expect } from "vitest";
import {
  applyFilterPatch,
  buildCustomerListQuery,
  buildTopQuery,
  parseCustomerFilters,
  toSearchParams,
} from "@/lib/customers/filters";

describe("customer filters", () => {
  it("por defecto: mes, gasto, sin búsqueda, página 1", () => {
    expect(parseCustomerFilters({})).toEqual({ period: "month", sortBy: "spent", page: 1 });
  });

  it("lee las palabras en español de la URL", () => {
    expect(parseCustomerFilters({ periodo: "hoy", orden: "compras", q: " ana ", page: "3" })).toEqual({
      period: "today",
      sortBy: "orders",
      search: "ana",
      page: 3,
    });
  });

  it("ignora valores no permitidos", () => {
    expect(parseCustomerFilters({ periodo: "año", orden: "x", page: "-2" })).toEqual({
      period: "month",
      sortBy: "spent",
      page: 1,
    });
  });

  it("serializa sin los valores por defecto", () => {
    expect(toSearchParams({ period: "month", sortBy: "spent", page: 1 })).toBe("");
    expect(toSearchParams({ period: "week", sortBy: "orders", search: "ana", page: 2 })).toBe(
      "periodo=semana&orden=compras&q=ana&page=2",
    );
  });

  it("cambiar un filtro reinicia la página; cambiar la página la conserva", () => {
    const base = { period: "month", sortBy: "spent", search: "ana", page: 4 } as const;
    expect(applyFilterPatch(base, { period: "week" })).toEqual({ period: "week", sortBy: "spent", search: "ana", page: 1 });
    expect(applyFilterPatch(base, { page: 5 }).page).toBe(5);
    expect(applyFilterPatch(base, { search: undefined })).toEqual({ period: "month", sortBy: "spent", page: 1 });
  });

  it("arma las consultas del API", () => {
    expect(buildTopQuery({ period: "week", sortBy: "orders" })).toBe("period=week&sortBy=orders");
    expect(buildCustomerListQuery({ period: "month", sortBy: "spent", search: "ana", page: 2 })).toBe(
      "search=ana&page=2&limit=20",
    );
  });
});
