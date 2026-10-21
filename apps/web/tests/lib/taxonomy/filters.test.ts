import { describe, expect, it } from "vitest";
import {
  applyFilterPatch,
  buildTaxonListQuery,
  hasActiveFilters,
  parseSelectedTaxon,
  parseTaxonFilters,
  toSearchParams,
} from "@/lib/taxonomy/filters";

const ID = "68f2ab12c3d4e5f6a7b8c9e1";

describe("parseTaxonFilters", () => {
  it("sin parámetros: activas, orden por nombre, página 1", () => {
    expect(parseTaxonFilters({})).toEqual({ status: "active", sort: "name", page: 1 });
  });

  it("lee los parámetros en español", () => {
    expect(parseTaxonFilters({ estado: "retiradas", q: "  flo ", orden: "-updatedAt", page: "3" })).toEqual({
      status: "retired",
      search: "flo",
      sort: "-updatedAt",
      page: 3,
    });
  });

  it("descarta estados, órdenes y páginas inválidos", () => {
    expect(parseTaxonFilters({ estado: "x", orden: "slug", page: "0", q: " " })).toEqual({
      status: "active",
      sort: "name",
      page: 1,
    });
  });

  it("toma el primer valor si el parámetro viene repetido", () => {
    expect(parseTaxonFilters({ estado: ["todas", "activas"] }).status).toBe("all");
  });
});

describe("parseSelectedTaxon", () => {
  it("entiende «nueva», un id válido y descarta lo demás, según el parámetro", () => {
    expect(parseSelectedTaxon({ familia: "nueva" }, "familia")).toBe("nueva");
    expect(parseSelectedTaxon({ familia: ID }, "familia")).toBe(ID);
    expect(parseSelectedTaxon({ familia: "../etc" }, "familia")).toBeUndefined();
    expect(parseSelectedTaxon({ categoria: ID }, "familia")).toBeUndefined();
  });
});

describe("buildTaxonListQuery", () => {
  it("activas por defecto, con límite de 24", () => {
    expect(buildTaxonListQuery({ status: "active", sort: "name", page: 1 })).toBe(
      "isActive=true&sort=name&page=1&limit=24",
    );
  });

  it("todas no manda isActive; retiradas manda false; búsqueda incluida", () => {
    expect(buildTaxonListQuery({ status: "all", sort: "-updatedAt", page: 2, search: "a b" })).toBe(
      "search=a+b&sort=-updatedAt&page=2&limit=24",
    );
    expect(buildTaxonListQuery({ status: "retired", sort: "name", page: 1 })).toContain("isActive=false");
  });
});

describe("toSearchParams", () => {
  it("omite los valores por defecto", () => {
    expect(toSearchParams({ status: "active", sort: "name", page: 1 }, "familia")).toBe("");
  });

  it("escribe en español y añade el registro abierto con su clave", () => {
    expect(toSearchParams({ status: "all", sort: "-updatedAt", page: 2, search: "x" }, "categoria", ID)).toBe(
      `estado=todas&q=x&orden=-updatedAt&page=2&categoria=${ID}`,
    );
  });
});

describe("applyFilterPatch", () => {
  const base = { status: "active", sort: "name", page: 3, search: "x" } as const;

  it("cualquier cambio distinto de la página vuelve a la 1", () => {
    expect(applyFilterPatch(base, { status: "all" })).toEqual({ status: "all", sort: "name", page: 1, search: "x" });
  });

  it("la página se conserva cuando es lo único que cambia", () => {
    expect(applyFilterPatch(base, { page: 5 }).page).toBe(5);
  });

  it("search: undefined limpia la búsqueda", () => {
    expect(applyFilterPatch(base, { search: undefined })).toEqual({ status: "active", sort: "name", page: 1 });
  });
});

describe("hasActiveFilters", () => {
  it("la búsqueda o un estado distinto de «activas» cuentan", () => {
    expect(hasActiveFilters({ status: "active", sort: "name", page: 1 })).toBe(false);
    expect(hasActiveFilters({ status: "retired", sort: "name", page: 1 })).toBe(true);
    expect(hasActiveFilters({ status: "active", sort: "name", page: 1, search: "a" })).toBe(true);
  });
});
