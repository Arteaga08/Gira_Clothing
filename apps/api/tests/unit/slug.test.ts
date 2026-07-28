import { describe, it, expect } from "vitest";
import { slugify, resolveUniqueSlug } from "../../src/utils/slug.js";

describe("slugify", () => {
  it("elimina acentos", () => {
    expect(slugify("Bárbara")).toBe("barbara");
  });

  it("normaliza eñes y espacios", () => {
    expect(slugify("Ñandú Ruffles")).toBe("nandu-ruffles");
  });

  it("colapsa signos y recorta guiones", () => {
    expect(slugify("  Tote — Bag!! ")).toBe("tote-bag");
  });

  it("devuelve cadena vacía si no queda nada utilizable", () => {
    expect(slugify("🌸🌸")).toBe("");
  });
});

describe("resolveUniqueSlug", () => {
  it("devuelve la base cuando está libre", async () => {
    await expect(resolveUniqueSlug("tote", async () => false)).resolves.toBe("tote");
  });

  it("agrega -2 cuando la base está tomada", async () => {
    const taken = new Set(["tote"]);
    await expect(resolveUniqueSlug("tote", async (c) => taken.has(c))).resolves.toBe("tote-2");
  });

  it("agrega -3 cuando la base y -2 están tomadas", async () => {
    const taken = new Set(["tote", "tote-2"]);
    await expect(resolveUniqueSlug("tote", async (c) => taken.has(c))).resolves.toBe("tote-3");
  });

  it("lanza 400 con base vacía", async () => {
    await expect(resolveUniqueSlug("", async () => false)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
