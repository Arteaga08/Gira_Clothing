import type { Print, PrintFamily, ProductCategory, Wire } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { toCatalogOptions, toPickerPrint, withCurrentCategory } from "@/lib/catalog/catalogOptions";
import { makeImage, PUBLIC_ID_SENTINEL, SLUG_SENTINEL } from "../../helpers/catalog";

const category = (id: string, name: string): Wire<ProductCategory> => ({ id, name, slug: SLUG_SENTINEL, isActive: true });
const family = (id: string, name: string): Wire<PrintFamily> => ({ id, name, slug: SLUG_SENTINEL, isActive: true });
const print = (id: string, name: string, familyId: string, familyName: string): Wire<Print> => ({
  id,
  name,
  slug: SLUG_SENTINEL,
  sku: name.slice(0, 3).toUpperCase(),
  family: { id: familyId, name: familyName, slug: SLUG_SENTINEL },
  image: makeImage(name, PUBLIC_ID_SENTINEL),
  isActive: true,
});

describe("toCatalogOptions", () => {
  it("ordena por nombre en español y recorta lo que la UI no pinta", () => {
    const options = toCatalogOptions(
      [category("c2", "Totes"), category("c1", "Álbumes")],
      [family("f2", "Tradición"), family("f1", "Flora")],
      [print("p2", "Zorro", "f1", "Flora"), print("p1", "Águila", "f2", "Tradición")],
    );
    expect(options.categories.map((o) => o.label)).toEqual(["Álbumes", "Totes"]);
    expect(options.families.map((o) => o.label)).toEqual(["Flora", "Tradición"]);
    expect(options.prints.map((p) => p.name)).toEqual(["Águila", "Zorro"]);
    expect(JSON.stringify(options)).not.toContain(SLUG_SENTINEL);
    expect(JSON.stringify(options)).not.toContain(PUBLIC_ID_SENTINEL);
  });
});

describe("toPickerPrint", () => {
  it("expone solo lo que el selector pinta", () => {
    expect(toPickerPrint(print("p1", "Nopal", "f1", "Flora"))).toEqual({
      id: "p1",
      name: "Nopal",
      sku: "NOP",
      familyId: "f1",
      familyName: "Flora",
      imageUrl: "https://res.cloudinary.com/gira/Nopal.jpg",
    });
  });
});

describe("withCurrentCategory", () => {
  it("agrega la categoría actual si ya no está entre las activas", () => {
    const options = [{ value: "c1", label: "Totes" }];
    expect(withCurrentCategory(options, "c9", "Retirada")).toEqual([
      { value: "c1", label: "Totes" },
      { value: "c9", label: "Retirada (retirada)" },
    ]);
  });

  it("no duplica una que ya está", () => {
    const options = [{ value: "c1", label: "Totes" }];
    expect(withCurrentCategory(options, "c1", "Totes")).toBe(options);
  });
});
