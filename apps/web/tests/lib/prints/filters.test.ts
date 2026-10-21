import { describe, expect, it } from "vitest";
import {
  applyFilterPatch,
  buildPrintListQuery,
  hasActiveFilters,
  parsePrintFilters,
  parseSelectedPrint,
  toSearchParams,
} from "@/lib/prints/filters";

const FAMILY = "68f2ab12c3d4e5f6a7b8c9e1";
const PRINT = "68f2ab12c3d4e5f6a7b8c9e2";

describe("parsePrintFilters", () => {
  it("sin parámetros: activas, orden por nombre, página 1", () => {
    expect(parsePrintFilters({})).toEqual({ status: "active", sort: "name", page: 1 });
  });

  it("lee los parámetros en español", () => {
    expect(
      parsePrintFilters({ familia: FAMILY, estado: "retiradas", q: "  rosa ", orden: "-updatedAt", page: "2" }),
    ).toEqual({ family: FAMILY, status: "retired", search: "rosa", sort: "-updatedAt", page: 2 });
  });

  it("descarta ids, estados, órdenes y páginas inválidos", () => {
    expect(
      parsePrintFilters({ familia: "x", estado: "x", orden: "password", page: "0", q: "  " }),
    ).toEqual({ status: "active", sort: "name", page: 1 });
  });

  it("toma el primer valor si el parámetro viene repetido", () => {
    expect(parsePrintFilters({ estado: ["todas", "activas"] }).status).toBe("all");
  });
});

describe("parseSelectedPrint", () => {
  it("entiende «nueva», un id válido y descarta lo demás", () => {
    expect(parseSelectedPrint({ estampa: "nueva" })).toBe("nueva");
    expect(parseSelectedPrint({ estampa: PRINT })).toBe(PRINT);
    expect(parseSelectedPrint({ estampa: "../etc" })).toBeUndefined();
    expect(parseSelectedPrint({})).toBeUndefined();
  });
});

describe("buildPrintListQuery", () => {
  it("arma la consulta del API con 24 por página", () => {
    const query = new URLSearchParams(
      buildPrintListQuery({ family: FAMILY, status: "retired", search: "rosa", sort: "sku", page: 2 }),
    );
    expect(query.get("family")).toBe(FAMILY);
    expect(query.get("isActive")).toBe("false");
    expect(query.get("search")).toBe("rosa");
    expect(query.get("sort")).toBe("sku");
    expect(query.get("page")).toBe("2");
    expect(query.get("limit")).toBe("24");
  });

  it("«todas» no manda isActive y «activas» manda true", () => {
    expect(new URLSearchParams(buildPrintListQuery({ status: "all", sort: "name", page: 1 })).has("isActive")).toBe(false);
    expect(new URLSearchParams(buildPrintListQuery({ status: "active", sort: "name", page: 1 })).get("isActive")).toBe("true");
  });
});

describe("toSearchParams", () => {
  it("omite los valores por defecto", () => {
    expect(toSearchParams({ status: "active", sort: "name", page: 1 })).toBe("");
  });

  it("escribe en español y deja la estampa abierta al final", () => {
    expect(
      toSearchParams({ family: FAMILY, status: "all", search: "rosa", sort: "sku", page: 3 }, PRINT),
    ).toBe(`estado=todas&familia=${FAMILY}&q=rosa&orden=sku&page=3&estampa=${PRINT}`);
    expect(toSearchParams({ status: "active", sort: "name", page: 1 }, "nueva")).toBe("estampa=nueva");
  });
});

describe("applyFilterPatch", () => {
  const base = { family: FAMILY, status: "active" as const, search: "a", sort: "name", page: 4 };

  it("cualquier cambio distinto de la página vuelve a la 1", () => {
    expect(applyFilterPatch(base, { status: "all" })).toEqual({ family: FAMILY, status: "all", search: "a", sort: "name", page: 1 });
  });

  it("cambiar solo la página la conserva", () => {
    expect(applyFilterPatch(base, { page: 5 }).page).toBe(5);
  });

  it("undefined limpia el filtro", () => {
    expect(applyFilterPatch(base, { family: undefined, search: undefined })).toEqual({ status: "active", sort: "name", page: 1 });
  });
});

describe("hasActiveFilters", () => {
  it("familia, búsqueda o un estado distinto del de por defecto", () => {
    expect(hasActiveFilters({ status: "active", sort: "name", page: 1 })).toBe(false);
    expect(hasActiveFilters({ status: "active", sort: "sku", page: 2 })).toBe(false);
    expect(hasActiveFilters({ family: FAMILY, status: "active", sort: "name", page: 1 })).toBe(true);
    expect(hasActiveFilters({ status: "all", sort: "name", page: 1 })).toBe(true);
    expect(hasActiveFilters({ search: "x", status: "active", sort: "name", page: 1 })).toBe(true);
  });
});
