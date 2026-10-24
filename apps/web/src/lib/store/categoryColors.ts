import type { CategoryColor } from "@gira/shared";

/**
 * Token utilities for the colour a category gives its cards and chips. The
 * class names are spelled out in full so Tailwind finds them; text on top is
 * always ink. `strong` fills the name band, `soft` the detail bands.
 */
const CATEGORY_TONE: Record<CategoryColor, { strong: string; soft: string }> = {
  bone: { strong: "bg-cat-bone", soft: "bg-cat-bone-soft" },
  pink: { strong: "bg-cat-pink", soft: "bg-cat-pink-soft" },
  lilac: { strong: "bg-cat-lilac", soft: "bg-cat-lilac-soft" },
  mint: { strong: "bg-cat-mint", soft: "bg-cat-mint-soft" },
  ikat: { strong: "bg-cat-ikat", soft: "bg-cat-ikat-soft" },
  tangerine: { strong: "bg-cat-tangerine", soft: "bg-cat-tangerine-soft" },
  cherry: { strong: "bg-cat-cherry", soft: "bg-cat-cherry-soft" },
  sky: { strong: "bg-cat-sky", soft: "bg-cat-sky-soft" },
};

/** Spanish names, as the colour picker and the chips say them. */
const CATEGORY_COLOR_LABEL: Record<CategoryColor, string> = {
  bone: "Hueso",
  pink: "Rosa",
  lilac: "Lila",
  mint: "Menta",
  ikat: "Azul ikat",
  tangerine: "Mandarina",
  cherry: "Cereza",
  sky: "Cielo",
};

export { CATEGORY_TONE, CATEGORY_COLOR_LABEL };
