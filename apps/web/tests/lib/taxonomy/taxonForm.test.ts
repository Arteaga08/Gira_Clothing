import { describe, expect, it } from "vitest";
import { toCreateBody, toUpdateBody, validateTaxonForm } from "@/lib/taxonomy/taxonForm";

const LIMITS = { nameMin: 2, nameMax: 80, descriptionMax: 500 };

describe("validateTaxonForm", () => {
  it("acepta un nombre y una descripción válidos (o vacía)", () => {
    expect(validateTaxonForm({ name: "Florales", description: "", color: null }, LIMITS)).toEqual({});
  });

  it("rechaza un nombre corto, largo o solo espacios", () => {
    expect(validateTaxonForm({ name: " a ", description: "", color: null }, LIMITS).name).toMatch(/entre 2 y 80/);
    expect(validateTaxonForm({ name: "x".repeat(81), description: "", color: null }, LIMITS).name).toBeDefined();
    expect(validateTaxonForm({ name: "   ", description: "", color: null }, LIMITS).name).toBeDefined();
  });

  it("rechaza una descripción de más de 500 caracteres", () => {
    expect(validateTaxonForm({ name: "Ok", description: "x".repeat(501), color: null }, LIMITS).description).toMatch(/500/);
  });
});

describe("toCreateBody", () => {
  it("recorta y no manda una descripción vacía", () => {
    expect(toCreateBody({ name: "  Rayas ", description: "  ", color: null })).toEqual({ name: "Rayas" });
    expect(toCreateBody({ name: "Rayas", description: " finas ", color: null })).toEqual({ name: "Rayas", description: "finas" });
  });
});

describe("color de categoría", () => {
  it("se manda al crear y solo si cambió al editar; las familias (color null) no lo mandan", () => {
    expect(toCreateBody({ name: "Gorras", description: "", color: "ikat" })).toEqual({ name: "Gorras", color: "ikat" });
    const baseline = { name: "Gorras", description: "", color: "bone" as const };
    expect(toUpdateBody({ name: "Gorras", description: "", color: "bone" }, baseline)).toEqual({});
    expect(toUpdateBody({ name: "Gorras", description: "", color: "cherry" }, baseline)).toEqual({ color: "cherry" });
  });
});

describe("toUpdateBody", () => {
  const baseline = { name: "Rayas", description: "Finas", color: null };

  it("sin cambios, cuerpo vacío", () => {
    expect(toUpdateBody({ name: " Rayas ", description: "Finas ", color: null }, baseline)).toEqual({});
  });

  it("manda solo lo que cambió", () => {
    expect(toUpdateBody({ name: "Rayas 2", description: "Finas", color: null }, baseline)).toEqual({ name: "Rayas 2" });
  });

  it("borrar la descripción manda cadena vacía", () => {
    expect(toUpdateBody({ name: "Rayas", description: "", color: null }, baseline)).toEqual({ description: "" });
  });
});
