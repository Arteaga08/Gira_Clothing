import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_GROUPS, NAV_ITEMS } from "@/lib/navigation";

describe("NAV_GROUPS / NAV_ITEMS", () => {
  it("aplana a NAV_ITEMS sin perder ni duplicar entradas", () => {
    const total = NAV_GROUPS.reduce((sum, group) => sum + group.items.length, 0);
    expect(NAV_ITEMS).toHaveLength(total);
  });

  it("solo Resumen está disponible en M7 — el resto llega en M8-M12", () => {
    const available = NAV_ITEMS.filter((item) => item.available);
    expect(available).toHaveLength(1);
    expect(available[0]?.key).toBe("summary");
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
    expect(isNavItemActive("/envios", "/pedidos")).toBe(false);
  });
});
