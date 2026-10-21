import { describe, expect, it } from "vitest";
import { toPanelPrint } from "@/lib/prints/panelPrint";

describe("toPanelPrint", () => {
  it("recorta al borde HTTP: sin slug ni publicId", () => {
    const panel = toPanelPrint({
      id: "p1",
      name: "Rosas",
      slug: "rosas",
      sku: "FLR-001",
      family: { id: "f1", name: "Florales", slug: "florales" },
      image: { url: "https://cdn/x.jpg", publicId: "gira/x", width: 1, height: 1 },
      isActive: true,
      variantCount: 3,
      activeVariantCount: 2,
      activeProducts: [{ id: "m1", name: "Neceser" }],
      updatedAt: "2026-10-20T00:00:00.000Z",
    });
    expect(panel).toEqual({
      id: "p1",
      name: "Rosas",
      sku: "FLR-001",
      family: { id: "f1", name: "Florales" },
      imageUrl: "https://cdn/x.jpg",
      isActive: true,
      variantCount: 3,
      activeVariantCount: 2,
      activeProducts: [{ id: "m1", name: "Neceser" }],
    });
  });
});
