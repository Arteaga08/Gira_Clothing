import {
  HERO_CARD_MAX_LENGTH,
  HERO_HEADLINE_MAX_LENGTH,
  HERO_HEADLINE_MAX_WORDS,
  HERO_MAX_CARDS,
  HERO_MAX_SLIDES,
  type HeroButtonColor,
  type HeroSurfaceColor,
  type ImageAttrs,
  type StorefrontHero,
} from "@gira/shared";

/**
 * Hero form helpers. The drafts keep blank cards and a stable `key` per photo
 * while the team types and reorders; `parseHero` is what actually travels to
 * the API.
 */

interface HeroCardDraft {
  text: string;
  color: HeroSurfaceColor;
}

interface HeroSlideDraft {
  key: string;
  headline: string;
  image: ImageAttrs;
  /** "" = no model: the photo's button leads to the shop. */
  productId: string;
  titleColor: HeroSurfaceColor;
  buttonColor: HeroButtonColor;
  cards: HeroCardDraft[];
}

interface HeroDraft {
  slides: HeroSlideDraft[];
}

type HeroParseResult = { hero: StorefrontHero } | { error: string };

const COLOR_LABELS: Record<HeroSurfaceColor | HeroButtonColor, string> = {
  bone: "Hueso",
  pink: "Rosa",
  lilac: "Lila",
  mint: "Menta",
  yellow: "Amarillo",
};

let keyCounter = 0;
const nextSlideKey = (): string => `slide-${(keyCounter += 1)}`;

const toDraft = (hero: StorefrontHero): HeroDraft => ({
  slides: hero.slides.map((slide) => ({
    key: nextSlideKey(),
    headline: slide.headline,
    image: slide.image,
    productId: slide.productId ?? "",
    titleColor: slide.titleColor,
    buttonColor: slide.buttonColor,
    cards: slide.cards.map((card) => ({ ...card })),
  })),
});

/** A new photo starts plain: bone title, yellow button, no cards, no model. */
const newSlideDraft = (image: ImageAttrs): HeroSlideDraft => ({
  key: nextSlideKey(),
  headline: "",
  image,
  productId: "",
  titleColor: "bone",
  buttonColor: "yellow",
  cards: [],
});

const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const normalizeHeadline = (text: string): string => text.trim().replace(/\s+/g, " ");

const parseHero = (draft: HeroDraft): HeroParseResult => {
  if (draft.slides.length > HERO_MAX_SLIDES) return { error: `Máximo ${HERO_MAX_SLIDES} fotos.` };

  const slides = draft.slides.map((slide) => ({
    headline: normalizeHeadline(slide.headline),
    image: slide.image,
    productId: slide.productId === "" ? null : slide.productId,
    titleColor: slide.titleColor,
    buttonColor: slide.buttonColor,
    cards: slide.cards
      .map((card) => ({ text: card.text.trim(), color: card.color }))
      .filter((card) => card.text.length > 0),
  }));
  const tooLong = slides.findIndex((slide) => slide.headline.length > HERO_HEADLINE_MAX_LENGTH);
  if (tooLong >= 0) {
    return { error: `Foto ${tooLong + 1}: el titular admite hasta ${HERO_HEADLINE_MAX_LENGTH} caracteres.` };
  }
  const tooManyWords = slides.findIndex((slide) => countWords(slide.headline) > HERO_HEADLINE_MAX_WORDS);
  if (tooManyWords >= 0) {
    return { error: `Foto ${tooManyWords + 1}: el titular admite hasta ${HERO_HEADLINE_MAX_WORDS} palabras.` };
  }
  if (slides.some((slide) => slide.cards.length > HERO_MAX_CARDS)) {
    return { error: `Máximo ${HERO_MAX_CARDS} cards por foto.` };
  }
  if (slides.some((slide) => slide.cards.some((card) => card.text.length > HERO_CARD_MAX_LENGTH))) {
    return { error: `Cada card admite hasta ${HERO_CARD_MAX_LENGTH} caracteres.` };
  }
  return { hero: { slides } };
};

/** What would be saved, as a string: equal signatures mean nothing changed. */
const heroSignature = (draft: HeroDraft): string => {
  const parsed = parseHero(draft);
  return JSON.stringify("hero" in parsed ? parsed.hero : draft);
};

export type { HeroCardDraft, HeroSlideDraft, HeroDraft, HeroParseResult };
export { COLOR_LABELS, countWords, heroSignature, newSlideDraft, nextSlideKey, parseHero, toDraft };
