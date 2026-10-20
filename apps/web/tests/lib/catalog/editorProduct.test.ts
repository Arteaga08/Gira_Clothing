import { describe, expect, it } from "vitest";
import { toEditorProduct, toExistingVariant } from "@/lib/catalog/editorProduct";
import { makeImage, makeRawProduct, makeRawVariant, CATEGORY_ID, PRINT_A_ID } from "../../helpers/catalog";

describe("toEditorProduct", () => {
  it("trae lo que el formulario edita", () => {
    const product = toEditorProduct(makeRawProduct({ sizeImage: makeImage("tamano") }));
    expect(product).toMatchObject({
      name: "Cosmetiquera chica",
      categoryId: CATEGORY_ID,
      categoryName: "Cosmetiquera",
      description: "Una cosmetiquera",
      basePrice: 18900,
      weightGrams: 140,
      measurements: { widthCm: 18, heightCm: 11, depthCm: 6 },
      materials: ["Lona de algodón", "forro impermeable"],
      isActive: true,
      activeVariantCount: 2,
    });
    expect(product.sizeImage?.publicId).toBe("gira/tamano");
  });

  it("sin descripción devuelve cadena vacía", () => {
    const raw = makeRawProduct();
    delete (raw as { description?: unknown }).description;
    expect(toEditorProduct(raw).description).toBe("");
  });
});

describe("toExistingVariant", () => {
  it("conserva las imágenes completas (hay que reenviarlas al guardar) y el stock", () => {
    const variant = toExistingVariant(makeRawVariant({ reserved: 2, priceOverride: 25000 }));
    expect(variant).toMatchObject({ printId: PRINT_A_ID, isActive: true, onHand: 12, reserved: 2, priceOverride: 25000 });
    expect(variant.images).toHaveLength(2);
    expect(variant.images[0]?.publicId).toBe("gira/foto-1");
  });

  it("sin images en la respuesta trabaja con lista vacía", () => {
    const raw = makeRawVariant();
    delete (raw as { images?: unknown }).images;
    expect(toExistingVariant(raw).images).toEqual([]);
  });
});
