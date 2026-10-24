import { describe, expect, it } from "vitest";
import type { ImageAttrs, StorefrontHero } from "@gira/shared";
import { heroSignature, newSlideDraft, parseHero, toDraft, type HeroDraft, type HeroSlideDraft } from "@/lib/settings/hero";

const image: ImageAttrs = { url: "https://res.cloudinary.com/gira/image/upload/a.jpg", publicId: "gira/home/a", width: 1600, height: 1000 };

const slideWith = (headline: string, extra: Partial<HeroSlideDraft> = {}): HeroSlideDraft => ({ ...newSlideDraft(image), headline, ...extra });
const draftWith = (...slides: HeroSlideDraft[]): HeroDraft => ({ slides });

describe("parseHero", () => {
  it("recorta y junta espacios del titular de cada foto y manda el producto vacío como null", () => {
    const result = parseHero(draftWith(slideWith("  Estampa   que gira ")));
    expect(result).toEqual({
      hero: {
        slides: [{ headline: "Estampa que gira", image, productId: null, titleColor: "bone", buttonColor: "yellow", cards: [] }],
      },
    });
  });

  it("cada foto lleva su propio titular", () => {
    const result = parseHero(draftWith(slideWith("Uno"), slideWith("Dos tres")));
    expect("hero" in result && result.hero.slides.map((s) => s.headline)).toEqual(["Uno", "Dos tres"]);
  });

  it("descarta las cards en blanco y recorta el texto de las demás", () => {
    const slide = slideWith("Hola", { cards: [{ text: "  Únicas ", color: "pink" }, { text: "   ", color: "mint" }] });
    const result = parseHero(draftWith(slide));
    expect("hero" in result && result.hero.slides[0]?.cards).toEqual([{ text: "Únicas", color: "pink" }]);
  });

  it("rechaza un titular de más de 3 palabras e indica cuál foto", () => {
    expect(parseHero(draftWith(slideWith("ok"), slideWith("uno dos tres cuatro")))).toEqual({
      error: "Foto 2: el titular admite hasta 3 palabras.",
    });
  });

  it("rechaza un titular de más de 40 caracteres", () => {
    expect(parseHero(draftWith(slideWith("x".repeat(41))))).toEqual({
      error: "Foto 1: el titular admite hasta 40 caracteres.",
    });
  });

  it("rechaza más de 5 fotos", () => {
    const slides = Array.from({ length: 6 }, () => slideWith("Hola"));
    expect(parseHero(draftWith(...slides))).toEqual({ error: "Máximo 5 fotos." });
  });

  it("rechaza una card de más de 30 caracteres", () => {
    const slide = slideWith("Hola", { cards: [{ text: "x".repeat(31), color: "bone" }] });
    expect(parseHero(draftWith(slide))).toEqual({ error: "Cada card admite hasta 30 caracteres." });
  });

  it("acepta el hero vacío y un titular vacío (la tienda muestra el nombre de la marca)", () => {
    expect(parseHero({ slides: [] })).toEqual({ hero: { slides: [] } });
    expect(parseHero(draftWith(slideWith("")))).toMatchObject({ hero: { slides: [{ headline: "" }] } });
  });
});

describe("heroSignature", () => {
  const hero: StorefrontHero = {
    slides: [{ headline: "Hola", image, productId: "64b0c0c0c0c0c0c0c0c0c0c0", titleColor: "pink", buttonColor: "mint", cards: [{ text: "Hola", color: "lilac" }] }],
  };

  it("es igual antes y después de convertir a borrador, aunque cambien las llaves internas", () => {
    expect(heroSignature(toDraft(hero))).toBe(heroSignature(toDraft(hero)));
  });

  it("cambia cuando cambia el titular de una foto", () => {
    const edited = toDraft(hero);
    edited.slides[0]!.headline = "Otro";
    expect(heroSignature(edited)).not.toBe(heroSignature(toDraft(hero)));
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
