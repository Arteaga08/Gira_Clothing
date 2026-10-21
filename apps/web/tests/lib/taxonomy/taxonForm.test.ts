import { describe, expect, it } from "vitest";
import { toCreateBody, toUpdateBody, validateTaxonForm } from "@/lib/taxonomy/taxonForm";

const LIMITS = { nameMin: 2, nameMax: 80, descriptionMax: 500 };

describe("validateTaxonForm", () => {
  it("acepta un nombre y una descripción válidos (o vacía)", () => {
    expect(validateTaxonForm({ name: "Florales", description: "" }, LIMITS)).toEqual({});
  });

  it("rechaza un nombre corto, largo o solo espacios", () => {
    expect(validateTaxonForm({ name: " a ", description: "" }, LIMITS).name).toMatch(/entre 2 y 80/);
    expect(validateTaxonForm({ name: "x".repeat(81), description: "" }, LIMITS).name).toBeDefined();
    expect(validateTaxonForm({ name: "   ", description: "" }, LIMITS).name).toBeDefined();
  });

  it("rechaza una descripción de más de 500 caracteres", () => {
    expect(validateTaxonForm({ name: "Ok", description: "x".repeat(501) }, LIMITS).description).toMatch(/500/);
  });
});

describe("toCreateBody", () => {
  it("recorta y no manda una descripción vacía", () => {
    expect(toCreateBody({ name: "  Rayas ", description: "  " })).toEqual({ name: "Rayas" });
    expect(toCreateBody({ name: "Rayas", description: " finas " })).toEqual({ name: "Rayas", description: "finas" });
  });
});

describe("toUpdateBody", () => {
  const baseline = { name: "Rayas", description: "Finas" };

  it("sin cambios, cuerpo vacío", () => {
    expect(toUpdateBody({ name: " Rayas ", description: "Finas " }, baseline)).toEqual({});
  });

  it("manda solo lo que cambió", () => {
    expect(toUpdateBody({ name: "Rayas 2", description: "Finas" }, baseline)).toEqual({ name: "Rayas 2" });
  });

  it("borrar la descripción manda cadena vacía", () => {
    expect(toUpdateBody({ name: "Rayas", description: "" }, baseline)).toEqual({ description: "" });
  });
});
