import { describe, it, expect } from "vitest";
import { parseListQuery, buildMeta } from "../../src/utils/parseListQuery.js";
import type { ListQueryConfig } from "../../src/utils/parseListQuery.js";

const CONFIG: ListQueryConfig = {
  sortable: ["name", "createdAt"],
  searchable: ["name", "sku"],
  defaultSort: "name",
};

describe("parseListQuery · paginación", () => {
  it("aplica page 1 y limit 20 por defecto", () => {
    const r = parseListQuery({}, CONFIG);
    expect(r).toMatchObject({ page: 1, limit: 20, skip: 0 });
  });

  it("recorta limit al máximo de 100", () => {
    expect(parseListQuery({ limit: 1000 }, CONFIG).limit).toBe(100);
  });

  it("cae a page 1 con valores inválidos", () => {
    for (const page of [0, -3, "abc", null]) {
      expect(parseListQuery({ page }, CONFIG).page).toBe(1);
    }
  });

  it("calcula skip como (page - 1) * limit", () => {
    expect(parseListQuery({ page: 3, limit: 10 }, CONFIG).skip).toBe(20);
  });
});

describe("parseListQuery · orden", () => {
  it("ordena ascendente con desempate por _id", () => {
    expect(parseListQuery({ sort: "name" }, CONFIG).sort).toEqual({ name: 1, _id: 1 });
  });

  it("ordena descendente con prefijo -", () => {
    expect(parseListQuery({ sort: "-createdAt" }, CONFIG).sort).toEqual({
      createdAt: -1,
      _id: -1,
    });
  });

  it("ignora un campo fuera de la whitelist y usa el orden por defecto", () => {
    expect(parseListQuery({ sort: "password" }, CONFIG).sort).toEqual({ name: 1, _id: 1 });
  });
});

describe("parseListQuery · búsqueda", () => {
  it("construye $or sobre cada campo buscable", () => {
    const { filter } = parseListQuery({ search: "tote" }, CONFIG);
    expect(filter.$or).toHaveLength(2);
  });

  it("escapa los metacaracteres de regex", () => {
    const { filter } = parseListQuery({ search: ".*" }, CONFIG);
    const first = (filter.$or as { name: RegExp }[])[0];
    expect(first?.name.source).toBe("\\.\\*");
  });

  it("no agrega $or con búsqueda vacía o en blanco", () => {
    expect(parseListQuery({ search: "   " }, CONFIG).filter.$or).toBeUndefined();
  });

  it("trunca la búsqueda a 80 caracteres", () => {
    const { filter } = parseListQuery({ search: "a".repeat(200) }, CONFIG);
    const first = (filter.$or as { name: RegExp }[])[0];
    expect(first?.name.source).toHaveLength(80);
  });

  it("preserva los filtros explícitos recibidos", () => {
    expect(parseListQuery({}, CONFIG, { isActive: true }).filter).toMatchObject({
      isActive: true,
    });
  });
});

describe("buildMeta", () => {
  it("devuelve 0 páginas cuando no hay resultados", () => {
    expect(buildMeta(0, { page: 1, limit: 20 })).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      pages: 0,
    });
  });

  it("redondea hacia arriba la última página parcial", () => {
    expect(buildMeta(21, { page: 1, limit: 20 }).pages).toBe(2);
  });
});
