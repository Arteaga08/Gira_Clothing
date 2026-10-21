import type { AdminPrintFamily, AdminProductCategory, Wire } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { toPanelCategory, toPanelFamily } from "@/lib/taxonomy/panelTaxon";

describe("toPanelFamily", () => {
  const dto = {
    id: "f1",
    name: "Florales",
    slug: "florales",
    isActive: true,
    printCount: 8,
    activePrintCount: 6,
    activePrints: [{ id: "p1", name: "Peonía" }],
    updatedAt: "2026-10-20T10:00:00.000Z",
  } as Wire<AdminPrintFamily>;

  it("recorta el slug y renombra los hijos; sin descripción queda vacía", () => {
    const panel = toPanelFamily(dto);
    expect(panel).toEqual({
      id: "f1",
      name: "Florales",
      description: "",
      isActive: true,
      childCount: 8,
      activeChildCount: 6,
      activeChildren: [{ id: "p1", name: "Peonía" }],
      updatedAt: "2026-10-20T10:00:00.000Z",
    });
    expect(panel).not.toHaveProperty("slug");
  });
});

describe("toPanelCategory", () => {
  it("mapea los modelos como hijos", () => {
    const panel = toPanelCategory({
      id: "c1",
      name: "Bolsas",
      slug: "bolsas",
      description: "Todas",
      isActive: false,
      productCount: 2,
      activeProductCount: 0,
      activeProducts: [],
      updatedAt: "2026-10-20T10:00:00.000Z",
    } as Wire<AdminProductCategory>);
    expect(panel).toMatchObject({ description: "Todas", isActive: false, childCount: 2, activeChildCount: 0, activeChildren: [] });
    expect(panel).not.toHaveProperty("slug");
  });
});
