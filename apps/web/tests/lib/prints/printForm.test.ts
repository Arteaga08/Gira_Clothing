import { describe, expect, it } from "vitest";
import { toCreateBody, toUpdateBody, validatePrintForm, type PrintFormValues } from "@/lib/prints/printForm";

const IMAGE = { url: "https://cdn/x.jpg", publicId: "gira/x", width: 10, height: 10 };
const VALID: PrintFormValues = { name: " Rosas ", sku: "flr-001", familyId: "f1", image: IMAGE };

describe("validatePrintForm", () => {
  it("datos válidos no dan errores", () => {
    expect(validatePrintForm(VALID, "create")).toEqual({});
  });

  it("marca cada campo en español", () => {
    expect(validatePrintForm({ name: "R", sku: "a b", familyId: "", image: null }, "create")).toEqual({
      name: "El nombre debe tener entre 2 y 80 caracteres.",
      sku: "El SKU debe tener de 2 a 24 caracteres: letras, números y guiones.",
      family: "Elige una familia.",
      image: "Sube la imagen de la estampa.",
    });
  });

  it("al editar no valida el SKU ni exige subir la imagen otra vez", () => {
    expect(validatePrintForm({ ...VALID, sku: "", image: null }, "edit")).toEqual({});
  });
});

describe("bodies", () => {
  it("crear recorta y pone el SKU en mayúsculas", () => {
    expect(toCreateBody(VALID)).toEqual({ name: "Rosas", sku: "FLR-001", family: "f1", image: IMAGE });
  });

  it("editar solo manda lo que cambió y nunca el SKU", () => {
    const base = { name: "Rosas", familyId: "f1", imageUrl: IMAGE.url };
    expect(toUpdateBody({ ...VALID, name: "Rosas" }, base)).toEqual({});
    expect(toUpdateBody({ ...VALID, name: "Otro", familyId: "f2" }, base)).toEqual({ name: "Otro", family: "f2" });
    expect(toUpdateBody({ ...VALID, image: { ...IMAGE, url: "https://cdn/y.jpg" } }, base)).toEqual({
      image: { ...IMAGE, url: "https://cdn/y.jpg" },
    });
    expect("sku" in toUpdateBody(VALID, base)).toBe(false);
  });
});
