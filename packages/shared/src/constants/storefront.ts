/** Storefront announcement bar (marquee): at most this many messages, each this long. */
const ANNOUNCEMENT_MAX_MESSAGES = 5;
const ANNOUNCEMENT_MAX_LENGTH = 80;

/**
 * Storefront hero (home): up to HERO_MAX_SLIDES photos that rise on their own,
 * a title of at most HERO_HEADLINE_MAX_WORDS words, and up to HERO_MAX_CARDS
 * floating cards per photo. Each photo stays on screen HERO_SLIDE_SECONDS.
 */
const HERO_MAX_SLIDES = 5;
const HERO_SLIDE_SECONDS = 3;
const HERO_HEADLINE_MAX_WORDS = 3;
const HERO_HEADLINE_MAX_LENGTH = 40;
const HERO_MAX_CARDS = 2;
const HERO_CARD_MAX_LENGTH = 30;

/** Fills the team may pick for the title and the cards (text is always ink). */
const HERO_SURFACE_COLORS = ["bone", "pink", "lilac", "mint"] as const;
/** Fills for the one action button. Never bone: no button is left white. */
const HERO_BUTTON_COLORS = ["yellow", "pink", "lilac", "mint"] as const;

export {
  ANNOUNCEMENT_MAX_MESSAGES,
  ANNOUNCEMENT_MAX_LENGTH,
  HERO_MAX_SLIDES,
  HERO_SLIDE_SECONDS,
  HERO_HEADLINE_MAX_WORDS,
  HERO_HEADLINE_MAX_LENGTH,
  HERO_MAX_CARDS,
  HERO_CARD_MAX_LENGTH,
  HERO_SURFACE_COLORS,
  HERO_BUTTON_COLORS,
};
