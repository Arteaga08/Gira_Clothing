import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_GROUPS, NAV_ITEMS } from "@/lib/navigation";

describe("NAV_GROUPS / NAV_ITEMS", () => {
  it("aplana a NAV_ITEMS sin perder ni duplicar entradas", () => {
    const total = NAV_GROUPS.reduce((sum, group) => sum + group.items.length, 0);
    expect(NAV_ITEMS).toHaveLength(total);
  });

  it("con Ajustes y Auditoría (M12c) todas las pantallas del Bloque 2 están disponibles", () => {
    const available = NAV_ITEMS.filter((item) => item.available).map((item) => item.key);
    expect(available).toEqual([
      "summary",
      "orders",
      "coupons",
      "homeContent",
      "products",
      "prints",
      "printFamilies",
      "categories",
      "variants",
      "customers",
      "settings",
      "auditLog",
    ]);
  });

  it("no hay entrada de Envíos: la logística se opera dentro de Pedidos", () => {
    expect(NAV_ITEMS.some((item) => item.key === "shipments")).toBe(false);
  });

  it("cada key es única", () => {
    const keys = NAV_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isNavItemActive", () => {
  it("coincide con la ruta exacta", () => {
    expect(isNavItemActive("/resumen", "/resumen")).toBe(true);
  });

  it("coincide por prefijo con un segmento de detalle", () => {
    expect(isNavItemActive("/pedidos/68f2ab", "/pedidos")).toBe(true);
  });

  it("no confunde un segmento que solo comparte el prefijo textual", () => {
    expect(isNavItemActive("/pedidosArchivados", "/pedidos")).toBe(false);
  });

  it("no coincide con otra sección", () => {
    expect(isNavItemActive("/resumen", "/pedidos")).toBe(false);
  });
});
