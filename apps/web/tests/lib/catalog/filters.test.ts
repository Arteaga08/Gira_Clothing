import { describe, expect, it } from "vitest";
import {
  applyFilterPatch,
  buildProductListQuery,
  hasActiveFilters,
  parseCatalogFilters,
  toSearchParams,
} from "@/lib/catalog/filters";

const CATEGORY = "68f2ab12c3d4e5f6a7b8c9e1";

describe("parseCatalogFilters", () => {
  it("sin parámetros: activos, orden por categoría, página 1", () => {
    expect(parseCatalogFilters({})).toEqual({ status: "active", sort: "category", page: 1 });
  });

  it("lee los parámetros en español", () => {
    expect(
      parseCatalogFilters({ categoria: CATEGORY, estado: "retirados", q: "  tote ", orden: "-basePrice", page: "3" }),
    ).toEqual({ category: CATEGORY, status: "retired", search: "tote", sort: "-basePrice", page: 3 });
  });

  it("descarta ids, estados, órdenes y páginas inválidos", () => {
    expect(
      parseCatalogFilters({ categoria: "no-es-id", estado: "x", orden: "password", page: "-2", q: "   " }),
    ).toEqual({ status: "active", sort: "category", page: 1 });
  });

  it("toma el primer valor cuando el parámetro viene repetido", () => {
    expect(parseCatalogFilters({ estado: ["todos", "activos"] }).status).toBe("all");
  });
});

describe("buildProductListQuery", () => {
  it("activos pide isActive=true", () => {
    const params = new URLSearchParams(buildProductListQuery({ status: "active", sort: "category", page: 1 }));
    expect(params.get("isActive")).toBe("true");
    expect(params.get("sort")).toBe("category");
    expect(params.get("limit")).toBe("100");
  });

  it("retirados pide isActive=false y todos no manda isActive", () => {
    const retired = new URLSearchParams(buildProductListQuery({ status: "retired", sort: "name", page: 2 }));
    expect(retired.get("isActive")).toBe("false");
    expect(retired.get("page")).toBe("2");
    const all = new URLSearchParams(buildProductListQuery({ status: "all", sort: "name", page: 1 }));
    expect(all.has("isActive")).toBe(false);
  });

  it("manda categoría y búsqueda al API", () => {
    const params = new URLSearchParams(
      buildProductListQuery({ status: "active", category: CATEGORY, search: "tote", sort: "name", page: 1 }),
    );
    expect(params.get("category")).toBe(CATEGORY);
    expect(params.get("search")).toBe("tote");
  });
});

describe("toSearchParams", () => {
  it("omite los valores por defecto", () => {
    expect(toSearchParams({ status: "active", sort: "category", page: 1 })).toBe("");
  });

  it("escribe lo que se aparta del defecto, en español", () => {
    const query = toSearchParams({ status: "retired", category: CATEGORY, search: "tote", sort: "name", page: 2 });
    const params = new URLSearchParams(query);
    expect(params.get("estado")).toBe("retirados");
    expect(params.get("categoria")).toBe(CATEGORY);
    expect(params.get("q")).toBe("tote");
    expect(params.get("orden")).toBe("name");
    expect(params.get("page")).toBe("2");
  });
});

describe("applyFilterPatch", () => {
  const current = { status: "active" as const, category: CATEGORY, sort: "category", page: 3 };

  it("un filtro nuevo vuelve a la página 1", () => {
    expect(applyFilterPatch(current, { search: "tote" })).toEqual({ ...current, search: "tote", page: 1 });
  });

  it("undefined limpia ese filtro", () => {
    const next = applyFilterPatch(current, { category: undefined });
    expect(next).not.toHaveProperty("category");
    expect(next.page).toBe(1);
  });

  it("cambiar solo la página la respeta", () => {
    expect(applyFilterPatch(current, { page: 2 }).page).toBe(2);
  });
});

describe("hasActiveFilters", () => {
  it("el estado por defecto y el orden no cuentan", () => {
    expect(hasActiveFilters({ status: "active", sort: "name", page: 1 })).toBe(false);
  });

  it("búsqueda, categoría o un estado distinto sí", () => {
    expect(hasActiveFilters({ status: "active", search: "a", sort: "category", page: 1 })).toBe(true);
    expect(hasActiveFilters({ status: "all", sort: "category", page: 1 })).toBe(true);
    expect(hasActiveFilters({ status: "active", category: CATEGORY, sort: "category", page: 1 })).toBe(true);
  });
});
