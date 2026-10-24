import { describe, expect, it } from "vitest";
import type { ImageAttrs, StorefrontHero } from "@gira/shared";
import { heroSignature, newSlideDraft, parseHero, toDraft, type HeroDraft } from "@/lib/settings/hero";

const image: ImageAttrs = { url: "https://res.cloudinary.com/gira/image/upload/a.jpg", publicId: "gira/home/a", width: 1600, height: 1000 };

const draftWith = (overrides: Partial<HeroDraft> = {}): HeroDraft => ({ headline: "Estampa que gira", slides: [newSlideDraft(image)], ...overrides });

describe("parseHero", () => {
  it("recorta y junta espacios del titular y manda el producto vacío como null", () => {
    const result = parseHero(draftWith({ headline: "  Estampa   que gira " }));
    expect(result).toEqual({
      hero: {
        headline: "Estampa que gira",
        slides: [{ image, productId: null, titleColor: "bone", buttonColor: "yellow", cards: [] }],
      },
    });
  });

  it("descarta las cards en blanco y recorta el texto de las demás", () => {
    const slide = { ...newSlideDraft(image), cards: [{ text: "  Únicas ", color: "pink" as const }, { text: "   ", color: "mint" as const }] };
    const result = parseHero(draftWith({ slides: [slide] }));
    expect("hero" in result && result.hero.slides[0]?.cards).toEqual([{ text: "Únicas", color: "pink" }]);
  });

  it("rechaza un titular de más de 3 palabras", () => {
    expect(parseHero(draftWith({ headline: "uno dos tres cuatro" }))).toEqual({ error: "El titular admite hasta 3 palabras." });
  });

  it("rechaza más de 5 fotos", () => {
    const slides = Array.from({ length: 6 }, () => newSlideDraft(image));
    expect(parseHero(draftWith({ slides }))).toEqual({ error: "Máximo 5 fotos." });
  });

  it("rechaza una card de más de 30 caracteres", () => {
    const slide = { ...newSlideDraft(image), cards: [{ text: "x".repeat(31), color: "bone" as const }] };
    expect(parseHero(draftWith({ slides: [slide] }))).toEqual({ error: "Cada card admite hasta 30 caracteres." });
  });

  it("acepta el hero vacío (la tienda muestra el nombre de la marca)", () => {
    expect(parseHero({ headline: "", slides: [] })).toEqual({ hero: { headline: "", slides: [] } });
  });
});

describe("heroSignature", () => {
  const hero: StorefrontHero = {
    headline: "Hola",
    slides: [{ image, productId: "64b0c0c0c0c0c0c0c0c0c0c0", titleColor: "pink", buttonColor: "mint", cards: [{ text: "Hola", color: "lilac" }] }],
  };

  it("es igual antes y después de convertir a borrador, aunque cambien las llaves internas", () => {
    expect(heroSignature(toDraft(hero))).toBe(heroSignature(toDraft(hero)));
  });

  it("cambia cuando cambia el color de un botón", () => {
    const edited = toDraft(hero);
    edited.slides[0]!.buttonColor = "pink";
    expect(heroSignature(edited)).not.toBe(heroSignature(toDraft(hero)));
  });

  it("no cambia por agregar una card en blanco (no viajaría al API)", () => {
    const edited = toDraft(hero);
    edited.slides[0]!.cards.push({ text: "  ", color: "pink" });
    expect(heroSignature(edited)).toBe(heroSignature(toDraft(hero)));
  });
});
