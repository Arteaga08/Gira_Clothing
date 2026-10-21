import { describe, expect, it } from "vitest";
import {
  applyFilterPatch,
  buildCouponListQuery,
  DEFAULT_SORT,
  hasActiveFilters,
  parseCouponFilters,
  parseSelectedCoupon,
  toSearchParams,
} from "@/lib/coupons/filters";

const ID = "68f2ab12c3d4e5f6a7b8c9e1";

describe("parseCouponFilters", () => {
  it("sin parámetros da los valores por defecto", () => {
    expect(parseCouponFilters({})).toEqual({ status: "all", kind: "all", sort: DEFAULT_SORT, page: 1 });
  });

  it("lee estado en español, búsqueda, orden y página", () => {
    expect(parseCouponFilters({ estado: "vencidos", q: " verano ", orden: "code", page: "3" })).toEqual({
      status: "expired",
      kind: "all",
      search: "verano",
      sort: "code",
      page: 3,
    });
  });

  it("valores inválidos caen al default", () => {
    expect(parseCouponFilters({ estado: "x", orden: "passwordHash", page: "-2" })).toEqual({
      status: "all",
      kind: "all",
      sort: DEFAULT_SORT,
      page: 1,
    });
  });

  it("recorta la búsqueda a 80 caracteres", () => {
    expect(parseCouponFilters({ q: "a".repeat(200) }).search).toHaveLength(80);
  });
});

describe("clase (campaña / personal)", () => {
  it("por defecto todas; lee campanas y personales; ignora lo demás", () => {
    expect(parseCouponFilters({}).kind).toBe("all");
    expect(parseCouponFilters({ clase: "personales" }).kind).toBe("personal");
    expect(parseCouponFilters({ clase: "campanas" }).kind).toBe("campaign");
    expect(parseCouponFilters({ clase: "x" }).kind).toBe("all");
  });

  it("se serializa en español, va al API y reinicia la página", () => {
    const filters = { ...parseCouponFilters({}), kind: "personal" as const };
    expect(toSearchParams(filters)).toContain("clase=personales");
    expect(buildCouponListQuery(filters)).toContain("clase=personales");
    expect(toSearchParams(parseCouponFilters({}))).not.toContain("clase");
    expect(applyFilterPatch({ ...filters, page: 3 }, { kind: "campaign" }).page).toBe(1);
    expect(hasActiveFilters(filters)).toBe(true);
  });
});

describe("parseSelectedCoupon", () => {
  it("acepta «nuevo» o un id válido", () => {
    expect(parseSelectedCoupon({ cupon: "nuevo" })).toBe("nuevo");
    expect(parseSelectedCoupon({ cupon: ID })).toBe(ID);
  });

  it("descarta basura y otros parámetros", () => {
    expect(parseSelectedCoupon({ cupon: "basura" })).toBeUndefined();
    expect(parseSelectedCoupon({ familia: ID })).toBeUndefined();
  });
});

describe("URL y consulta", () => {
  it("los valores por defecto no ensucian la URL y ida y vuelta es estable", () => {
    expect(toSearchParams({ status: "all", kind: "all", sort: DEFAULT_SORT, page: 1 })).toBe("");
    const filters = { status: "retired" as const, kind: "all" as const, search: "x", sort: "-redeemedCount", page: 2 };
    const query = toSearchParams(filters, ID);
    const params = Object.fromEntries(new URLSearchParams(query));
    expect(params).toEqual({ estado: "retirados", q: "x", orden: "-redeemedCount", page: "2", cupon: ID });
    expect(parseCouponFilters(params)).toEqual(filters);
  });

  it("buildCouponListQuery manda el estado en español solo si filtra", () => {
    expect(buildCouponListQuery({ status: "all", kind: "all", sort: DEFAULT_SORT, page: 1 })).toBe("sort=-createdAt&page=1&limit=20");
    expect(buildCouponListQuery({ status: "exhausted", kind: "all", search: "a b", sort: "code", page: 2 })).toBe(
      "estado=agotados&search=a+b&sort=code&page=2&limit=20",
    );
  });

  it("cambiar un filtro reinicia la página; cambiar solo la página no", () => {
    const base = { status: "all" as const, kind: "all" as const, sort: DEFAULT_SORT, page: 4 };
    expect(applyFilterPatch(base, { status: "active" }).page).toBe(1);
    expect(applyFilterPatch(base, { page: 5 }).page).toBe(5);
    expect(applyFilterPatch({ ...base, search: "x" }, { search: undefined }).search).toBeUndefined();
  });

  it("hasActiveFilters", () => {
    expect(hasActiveFilters({ status: "all", kind: "all", sort: DEFAULT_SORT, page: 1 })).toBe(false);
    expect(hasActiveFilters({ status: "active", kind: "all", sort: DEFAULT_SORT, page: 1 })).toBe(true);
    expect(hasActiveFilters({ status: "all", kind: "all", search: "x", sort: DEFAULT_SORT, page: 1 })).toBe(true);
  });
});
