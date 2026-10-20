import { describe, expect, it } from "vitest";
import { toPanelProduct } from "@/lib/catalog/panelProduct";
import { makeRawProduct, PUBLIC_ID_SENTINEL, SLUG_SENTINEL } from "../../helpers/catalog";

describe("toPanelProduct", () => {
  it("conserva lo que la lista pinta", () => {
    const product = toPanelProduct(makeRawProduct());
    expect(product).toMatchObject({
      name: "Cosmetiquera chica",
      category: { name: "Cosmetiquera" },
      basePrice: 18900,
      isActive: true,
      activeVariantCount: 2,
      cover: { url: "https://res.cloudinary.com/gira/portada.jpg" },
    });
    expect(product.prints.map((print) => print.name)).toEqual(["Nopal en flor", "Monarca"]);
    expect(product.prints[0]?.image.url).toContain("nopal");
  });

  it("corta en la frontera slugs, ids de almacenamiento, descripción, peso y medidas", () => {
    const json = JSON.stringify(toPanelProduct(makeRawProduct()));
    expect(json).not.toContain(SLUG_SENTINEL);
    expect(json).not.toContain(PUBLIC_ID_SENTINEL);
    expect(json).not.toContain("Una cosmetiquera");
    expect(json).not.toContain("weightGrams");
    expect(json).not.toContain("measurements");
    expect(json).not.toContain("variantCount");
  });

  it("sin portada no inventa la clave", () => {
    const raw = makeRawProduct();
    delete (raw as { cover?: unknown }).cover;
    expect(toPanelProduct(raw)).not.toHaveProperty("cover");
  });
});
