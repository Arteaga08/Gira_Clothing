import { OrderPriority, OrderStatus } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { applyFilterPatch, buildOrderListQuery, parseOrderFilters, toSearchParams } from "@/lib/orders/filters";

describe("parseOrderFilters", () => {
  it("sin parámetros arranca en Pagado, más recientes, página 1", () => {
    expect(parseOrderFilters({})).toEqual({ tab: "paid", sort: "-createdAt", page: 1 });
  });

  it("una pestaña desconocida cae en Pagado", () => {
    expect(parseOrderFilters({ tab: "hackeado" }).tab).toBe("paid");
  });

  it("el estado solo cuenta en Todos y debe ser un estado real", () => {
    expect(parseOrderFilters({ tab: "all", status: "cancelled" }).status).toBe(OrderStatus.CANCELLED);
    expect(parseOrderFilters({ tab: "all", status: "otro" }).status).toBeUndefined();
    expect(parseOrderFilters({ tab: "paid", status: "cancelled" }).status).toBeUndefined();
  });

  it("normaliza el folio a mayúsculas y descarta los inválidos", () => {
    expect(parseOrderFilters({ folio: " gc-7kq3m2xv " }).orderNumber).toBe("GC-7KQ3M2XV");
    expect(parseOrderFilters({ folio: "GC-0000000I" }).orderNumber).toBeUndefined();
    expect(parseOrderFilters({ folio: "ABC" }).orderNumber).toBeUndefined();
  });

  it("recorta la búsqueda a 80 caracteres y omite la vacía", () => {
    expect(parseOrderFilters({ q: "  ana  " }).search).toBe("ana");
    expect(parseOrderFilters({ q: "   " }).search).toBeUndefined();
    expect(parseOrderFilters({ q: "x".repeat(200) }).search).toHaveLength(80);
  });

  it("acepta solo prioridades reales", () => {
    expect(parseOrderFilters({ prioridad: "urgente" }).priority).toBe(OrderPriority.URGENT);
    expect(parseOrderFilters({ prioridad: "x" }).priority).toBeUndefined();
  });

  it("el orden sale de la lista blanca, con o sin guion", () => {
    expect(parseOrderFilters({ orden: "total" }).sort).toBe("total");
    expect(parseOrderFilters({ orden: "-priority" }).sort).toBe("-priority");
    expect(parseOrderFilters({ orden: "-password" }).sort).toBe("-createdAt");
  });

  it("la página inválida vuelve a 1", () => {
    expect(parseOrderFilters({ page: "3" }).page).toBe(3);
    expect(parseOrderFilters({ page: "0" }).page).toBe(1);
    expect(parseOrderFilters({ page: "abc" }).page).toBe(1);
  });

  it("toma el primer valor si un parámetro llega repetido", () => {
    expect(parseOrderFilters({ tab: ["shipped", "paid"] }).tab).toBe("shipped");
  });
});

describe("buildOrderListQuery", () => {
  it("manda el estado de la pestaña y nunca el grupo", () => {
    const query = new URLSearchParams(buildOrderListQuery(parseOrderFilters({ tab: "processing" })));
    expect(query.get("status")).toBe("processing");
    expect(query.has("group")).toBe(false);
    expect(query.get("limit")).toBe("20");
    expect(query.get("sort")).toBe("-createdAt");
  });

  it("en Todos sin estado no filtra por estado", () => {
    const query = new URLSearchParams(buildOrderListQuery(parseOrderFilters({ tab: "all" })));
    expect(query.has("status")).toBe(false);
  });

  it("incluye folio, búsqueda, prioridad y página cuando existen", () => {
    const filters = parseOrderFilters({ tab: "all", status: "paid", folio: "GC-7KQ3M2XV", q: "ana", prioridad: "alta", page: "2" });
    const query = new URLSearchParams(buildOrderListQuery(filters, 10));
    expect(Object.fromEntries(query)).toEqual({
      status: "paid",
      orderNumber: "GC-7KQ3M2XV",
      search: "ana",
      priority: "alta",
      sort: "-createdAt",
      page: "2",
      limit: "10",
    });
  });
});

describe("toSearchParams", () => {
  it("omite los valores por defecto", () => {
    expect(toSearchParams(parseOrderFilters({}))).toBe("");
  });

  it("ida y vuelta: lo que se escribe en la URL se lee igual", () => {
    const filters = parseOrderFilters({ tab: "all", status: "refunded", folio: "GC-7KQ3M2XV", q: "ana", prioridad: "urgente", orden: "-total", page: "4" });
    const params = Object.fromEntries(new URLSearchParams(toSearchParams(filters)));
    expect(parseOrderFilters(params)).toEqual(filters);
  });
});

describe("applyFilterPatch", () => {
  const base = parseOrderFilters({ tab: "all", status: "paid", q: "ana", page: "3" });

  it("cualquier cambio de filtro vuelve a la página 1", () => {
    expect(applyFilterPatch(base, { search: "luis" }).page).toBe(1);
  });

  it("cambiar solo la página la respeta", () => {
    expect(applyFilterPatch(base, { page: 4 }).page).toBe(4);
  });

  it("undefined limpia ese filtro y deja los demás", () => {
    const next = applyFilterPatch(base, { search: undefined });
    expect(next.search).toBeUndefined();
    expect("search" in next).toBe(false);
    expect(next.status).toBe(OrderStatus.PAID);
  });

  it("al cambiar de pestaña se descarta el selector de estado", () => {
    const next = applyFilterPatch(base, { tab: OrderStatus.SHIPPED });
    expect(next.tab).toBe(OrderStatus.SHIPPED);
    expect(next.status).toBeUndefined();
    expect(next.search).toBe("ana");
  });

  it("el estado solo sobrevive en Todos", () => {
    const paid = parseOrderFilters({ tab: "paid" });
    expect(applyFilterPatch(paid, { status: OrderStatus.CANCELLED }).status).toBeUndefined();
  });

  it("no muta el objeto original", () => {
    const copy = structuredClone(base);
    applyFilterPatch(base, { priority: OrderPriority.URGENT });
    expect(base).toEqual(copy);
  });
});
