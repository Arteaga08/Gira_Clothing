import { describe, expect, it } from "vitest";
import {
  CATALOG_PAGE_SIZE,
  buildCatalogApiQuery,
  catalogHref,
  parseCatalogQuery,
  withCategory,
  withPage,
  withSort,
} from "@/lib/store/catalogQuery";

describe("parseCatalogQuery", () => {
  it("sin parámetros: todo, novedades, página 1", () => {
    expect(parseCatalogQuery({})).toEqual({ category: undefined, print: undefined, newArrival: false, sort: "novedades", page: 1 });
  });

  it("lee las llaves en español de la URL", () => {
    expect(parseCatalogQuery({ categoria: "playeras", estampa: "ikat-rojo", novedad: "si", orden: "precio-desc", pagina: "3" })).toEqual({
      category: "playeras",
      print: "ikat-rojo",
      newArrival: true,
      sort: "precio-desc",
      page: 3,
    });
  });

  it("ignora valores inválidos en lugar de fallar", () => {
    const query = parseCatalogQuery({ categoria: "../etc;DROP", estampa: "A B", novedad: "no", orden: "caro", pagina: "-2" });
    expect(query).toEqual({ category: undefined, print: undefined, newArrival: false, sort: "novedades", page: 1 });
  });

  it("acota la página y toma el primer valor si viene repetido", () => {
    expect(parseCatalogQuery({ pagina: "99999" }).page).toBe(500);
    expect(parseCatalogQuery({ pagina: "0" }).page).toBe(1);
    expect(parseCatalogQuery({ categoria: ["gorras", "tote-bags"] }).category).toBe("gorras");
  });
});

describe("buildCatalogApiQuery", () => {
  it("traduce a los nombres de la API", () => {
    const query = parseCatalogQuery({ categoria: "playeras", estampa: "ikat", novedad: "si", orden: "precio-asc", pagina: "2" });
    const params = new URLSearchParams(buildCatalogApiQuery(query));
    expect(params.get("category")).toBe("playeras");
    expect(params.get("print")).toBe("ikat");
    expect(params.get("newArrival")).toBe("true");
    expect(params.get("sort")).toBe("basePrice");
    expect(params.get("page")).toBe("2");
    expect(params.get("limit")).toBe(String(CATALOG_PAGE_SIZE));
  });

  it("cada orden mapea a su campo y dirección", () => {
    const sortOf = (orden: string) => new URLSearchParams(buildCatalogApiQuery(parseCatalogQuery({ orden }))).get("sort");
    expect(sortOf("novedades")).toBe("-createdAt");
    expect(sortOf("precio-desc")).toBe("-basePrice");
    expect(sortOf("az")).toBe("name");
    expect(sortOf("za")).toBe("-name");
  });

  it("sin filtros no manda category, print ni newArrival", () => {
    const params = new URLSearchParams(buildCatalogApiQuery(parseCatalogQuery({})));
    expect(params.has("category")).toBe(false);
    expect(params.has("print")).toBe(false);
    expect(params.has("newArrival")).toBe(false);
  });
});

describe("catalogHref", () => {
  it("omite los valores por defecto", () => {
    expect(catalogHref(parseCatalogQuery({}))).toBe("/tienda");
  });

  it("escribe solo lo que cambia", () => {
    expect(catalogHref(parseCatalogQuery({ categoria: "gorras", orden: "za", pagina: "2" }))).toBe("/tienda?categoria=gorras&orden=za&pagina=2");
    expect(catalogHref(parseCatalogQuery({ novedad: "si" }))).toBe("/tienda?novedad=si");
  });

  it("coincide con los enlaces que ya usa el home", () => {
    expect(catalogHref(parseCatalogQuery({ categoria: "playeras" }))).toBe("/tienda?categoria=playeras");
    expect(catalogHref(parseCatalogQuery({ estampa: "ikat" }))).toBe("/tienda?estampa=ikat");
  });
});

describe("cambios de filtro", () => {
  const base = parseCatalogQuery({ categoria: "gorras", orden: "az", pagina: "4" });

  it("cambiar de categoría o de orden vuelve a la página 1 y conserva el resto", () => {
    expect(withCategory(base, "playeras")).toMatchObject({ category: "playeras", sort: "az", page: 1 });
    expect(withCategory(base, undefined).category).toBeUndefined();
    expect(withSort(base, "za")).toMatchObject({ category: "gorras", sort: "za", page: 1 });
  });

  it("cambiar de página conserva los filtros", () => {
    expect(withPage(base, 2)).toMatchObject({ category: "gorras", sort: "az", page: 2 });
  });
});
