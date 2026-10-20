import { describe, expect, it } from "vitest";
import { toPanelVariant } from "@/lib/inventory/panelVariant";
import { IMAGE_PUBLIC_ID_SENTINEL, PRINT_SKU_SENTINEL, SLUG_SENTINEL, makeRawVariant } from "../../helpers/inventory";

describe("toPanelVariant", () => {
  it("conserva lo que la UI pinta", () => {
    const variant = toPanelVariant(makeRawVariant({ priceOverride: 45000 }));
    expect(variant).toMatchObject({
      sku: "HOOD-BRUMA",
      product: { name: "Hoodie Oversize", category: { name: "Hoodies" } },
      print: { name: "Bruma", image: { url: "https://res.cloudinary.com/gira/bruma.jpg" } },
      onHand: 10,
      reserved: 2,
      available: 8,
      priceOverride: 45000,
      isActive: true,
    });
  });

  it("recorta slugs, SKU de print y datos internos de la imagen en la frontera HTTP", () => {
    const serialized = JSON.stringify(toPanelVariant(makeRawVariant()));
    expect(serialized).not.toContain(SLUG_SENTINEL);
    expect(serialized).not.toContain(IMAGE_PUBLIC_ID_SENTINEL);
    expect(serialized).not.toContain("publicId");
    expect(serialized).not.toContain(PRINT_SKU_SENTINEL);
  });

  it("sin priceOverride no inventa la llave", () => {
    expect(toPanelVariant(makeRawVariant())).not.toHaveProperty("priceOverride");
  });
});
