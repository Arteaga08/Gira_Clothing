import { describe, expect, it } from "vitest";
import {
  applyFilterPatch,
  buildVariantListQuery,
  parseInventoryFilters,
  toSearchParams,
} from "@/lib/inventory/filters";

const ID = "68f2ab12c3d4e5f6a7b8c9d0";
const ID2 = "68f2ab12c3d4e5f6a7b8c9d9";

describe("parseInventoryFilters", () => {
  it("sin parámetros: Todos, lo urgente primero, página 1", () => {
    expect(parseInventoryFilters({})).toEqual({ sort: "available", page: 1 });
  });

  it("estado en español se traduce al estado del API y lo desconocido se ignora", () => {
    expect(parseInventoryFilters({ estado: "agotado" }).stock).toBe("out");
    expect(parseInventoryFilters({ estado: "bajo" }).stock).toBe("low");
    expect(parseInventoryFilters({ estado: "ok" }).stock).toBe("ok");
    expect(parseInventoryFilters({ estado: "todos" }).stock).toBeUndefined();
    expect(parseInventoryFilters({ estado: "low" }).stock).toBeUndefined();
  });

  it("categoria, modelo y print solo aceptan ids válidos", () => {
    const parsed = parseInventoryFilters({ categoria: ID, modelo: ID2, print: ID });
    expect(parsed).toMatchObject({ category: ID, product: ID2, print: ID });
    const bad = parseInventoryFilters({ categoria: "../etc", modelo: "x", print: ID + "0" });
    expect(bad.category).toBeUndefined();
    expect(bad.product).toBeUndefined();
    expect(bad.print).toBeUndefined();
  });

  it("recorta la búsqueda a 80 y omite la vacía", () => {
    expect(parseInventoryFilters({ q: "  bruma " }).search).toBe("bruma");
    expect(parseInventoryFilters({ q: "  " }).search).toBeUndefined();
    expect(parseInventoryFilters({ q: "x".repeat(200) }).search).toHaveLength(80);
  });

  it("el orden sale de la lista blanca", () => {
    expect(parseInventoryFilters({ orden: "-available" }).sort).toBe("-available");
    expect(parseInventoryFilters({ orden: "sku" }).sort).toBe("sku");
    expect(parseInventoryFilters({ orden: "-updatedAt" }).sort).toBe("-updatedAt");
    expect(parseInventoryFilters({ orden: "password" }).sort).toBe("available");
  });

  it("página inválida vuelve a 1 y el primer valor gana", () => {
    expect(parseInventoryFilters({ page: "4" }).page).toBe(4);
    expect(parseInventoryFilters({ page: "-1" }).page).toBe(1);
    expect(parseInventoryFilters({ estado: ["bajo", "ok"] }).stock).toBe("low");
  });
});

describe("buildVariantListQuery", () => {
  it("siempre pide solo variantes activas y manda limit/page/sort", () => {
    const query = new URLSearchParams(buildVariantListQuery({ sort: "available", page: 1 }, 100));
    expect(Object.fromEntries(query)).toEqual({ isActive: "true", sort: "available", page: "1", limit: "100" });
  });

  it("incluye cada filtro con el nombre del API", () => {
    const query = new URLSearchParams(
      buildVariantListQuery({ stock: "low", category: ID, product: ID2, print: ID, search: "br", sort: "sku", page: 2 }, 50),
    );
    expect(Object.fromEntries(query)).toEqual({
      isActive: "true",
      stock: "low",
      category: ID,
      product: ID2,
      print: ID,
      search: "br",
      sort: "sku",
      page: "2",
      limit: "50",
    });
  });
});

describe("toSearchParams", () => {
  it("omite los valores por defecto", () => {
    expect(toSearchParams({ sort: "available", page: 1 })).toBe("");
  });

  it("usa los nombres en español", () => {
    const params = new URLSearchParams(
      toSearchParams({ stock: "out", category: ID, product: ID2, print: ID, search: "br", sort: "-available", page: 3 }),
    );
    expect(Object.fromEntries(params)).toEqual({
      estado: "agotado",
      categoria: ID,
      modelo: ID2,
      print: ID,
      q: "br",
      orden: "-available",
      page: "3",
    });
  });

  it("ida y vuelta: parse(toSearchParams(f)) == f", () => {
    const filters = { stock: "low" as const, category: ID, search: "br", sort: "sku", page: 2 };
    const params = Object.fromEntries(new URLSearchParams(toSearchParams(filters)));
    expect(parseInventoryFilters(params)).toEqual(filters);
  });
});

describe("applyFilterPatch", () => {
  const current = { stock: "low" as const, category: ID, search: "br", sort: "sku", page: 3 };

  it("un cambio de filtro vuelve a la página 1", () => {
    expect(applyFilterPatch(current, { stock: "out" })).toEqual({ ...current, stock: "out", page: 1 });
  });

  it("undefined limpia ese filtro y conserva los demás", () => {
    expect(applyFilterPatch(current, { stock: undefined, search: undefined })).toEqual({
      category: ID,
      sort: "sku",
      page: 1,
    });
  });

  it("cambiar solo la página la respeta", () => {
    expect(applyFilterPatch(current, { page: 5 }).page).toBe(5);
  });

  it("no toca lo que el parche no menciona", () => {
    expect(applyFilterPatch(current, { sort: "available" })).toMatchObject({ stock: "low", category: ID, search: "br" });
  });
});
