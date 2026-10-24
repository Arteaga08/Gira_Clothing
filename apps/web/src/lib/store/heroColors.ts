import type { HeroButtonColor, HeroSurfaceColor } from "@gira/shared";

/**
 * Token utilities for the colours the team picks in «Contenido de home». The
 * text on top is always ink, the pairing that clears AA on all of them.
 */
const SURFACE_FILL: Record<HeroSurfaceColor, string> = {
  bone: "bg-surface",
  pink: "bg-accent",
  lilac: "bg-tile-alt",
  mint: "bg-brand-subtle",
};

const BUTTON_FILL: Record<HeroButtonColor, string> = {
  yellow: "bg-cta",
  pink: "bg-accent",
  lilac: "bg-tile-alt",
  mint: "bg-brand-subtle",
};

export { SURFACE_FILL, BUTTON_FILL };
